import { NextResponse } from 'next/server';

interface SessionData {
  id: string;
  shortCode: string;
  offer?: RTCSessionDescriptionInit;
  answer?: RTCSessionDescriptionInit;
  hostCandidates: RTCIceCandidateInit[];
  peerCandidates: RTCIceCandidateInit[];
  createdAt: number;
}

// Ephemeral in-memory zero-database signaling store on globalThis
const globalScope = globalThis as unknown as {
  __flashtransfer_sessions?: Map<string, SessionData>;
  __flashtransfer_codeToId?: Map<string, string>;
};

if (!globalScope.__flashtransfer_sessions) {
  globalScope.__flashtransfer_sessions = new Map();
}
if (!globalScope.__flashtransfer_codeToId) {
  globalScope.__flashtransfer_codeToId = new Map();
}

const sessions = globalScope.__flashtransfer_sessions;
const codeToId = globalScope.__flashtransfer_codeToId;

function cleanupExpired() {
  const now = Date.now();
  const TTL = 1000 * 60 * 15; // 15 minutes TTL (purely ephemeral)
  for (const [id, sess] of sessions.entries()) {
    if (now - sess.createdAt > TTL) {
      codeToId.delete(sess.shortCode);
      sessions.delete(id);
    }
  }
}

export async function POST(req: Request) {
  cleanupExpired();

  try {
    const body = await req.json();
    const { action, id, shortCode, sdp, candidate, fromHost } = body;

    if (action === 'create') {
      const sessionId = id || `sess_${Math.random().toString(36).substring(2, 9)}`;
      const sess: SessionData = {
        id: sessionId,
        shortCode: shortCode?.toLowerCase() || '',
        offer: sdp,
        hostCandidates: [],
        peerCandidates: [],
        createdAt: Date.now(),
      };
      sessions.set(sessionId, sess);
      if (sess.shortCode) {
        codeToId.set(sess.shortCode, sessionId);
      }
      return NextResponse.json({ success: true, id: sessionId });
    }

    if (action === 'get') {
      const sessionId = id || (shortCode ? codeToId.get(shortCode.toLowerCase()) : null);
      if (!sessionId || !sessions.has(sessionId)) {
        return NextResponse.json({ error: 'Session not found or expired' }, { status: 404 });
      }
      const sess = sessions.get(sessionId)!;
      return NextResponse.json({
        success: true,
        session: {
          id: sess.id,
          shortCode: sess.shortCode,
          offer: sess.offer,
          answer: sess.answer,
          hostCandidates: sess.hostCandidates,
          peerCandidates: sess.peerCandidates,
        },
      });
    }

    if (action === 'answer') {
      const sess = sessions.get(id);
      if (!sess) {
        return NextResponse.json({ error: 'Session not found' }, { status: 404 });
      }
      sess.answer = sdp;
      return NextResponse.json({ success: true });
    }

    if (action === 'add-candidate') {
      const sess = sessions.get(id);
      if (!sess) {
        return NextResponse.json({ error: 'Session not found' }, { status: 404 });
      }
      if (candidate) {
        if (fromHost) {
          sess.hostCandidates.push(candidate);
        } else {
          sess.peerCandidates.push(candidate);
        }
      }
      return NextResponse.json({ success: true });
    }

    if (action === 'close') {
      const sess = sessions.get(id);
      if (sess) {
        codeToId.delete(sess.shortCode);
        sessions.delete(id);
      }
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
