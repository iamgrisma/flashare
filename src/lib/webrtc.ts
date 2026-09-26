export interface FileInfo {
  id: string;
  name: string;
  size: number;
  mime: string;
}

export interface TransferProgress {
  fileId: string;
  name: string;
  size: number;
  progress: number; // 0 to 100
  speed: number;    // bytes per second
  status: 'pending' | 'transferring' | 'completed' | 'error';
  url?: string;
}

export interface PeerCallbacks {
  onStatusChange: (status: 'disconnected' | 'waiting' | 'connecting' | 'connected') => void;
  onIncomingFile: (transfer: TransferProgress) => void;
  onIncomingProgress: (transfer: TransferProgress) => void;
  onOutgoingProgress: (transfer: TransferProgress) => void;
  onError: (msg: string) => void;
}

const CHUNK_SIZE = 64 * 1024; // 64 KB
const BUFFER_THRESHOLD = 1024 * 1024; // 1 MB backpressure limit
const MAGIC_HEADER = 0x464c4153; // "FLAS"

export class WebRTCEngine {
  private ws: WebSocket | null = null;
  private pc: RTCPeerConnection | null = null;
  private channel: RTCDataChannel | null = null;
  private isInitiator: boolean = false;
  private callbacks: PeerCallbacks;
  private incomingFiles = new Map<string, {
    info: FileInfo;
    receivedBytes: number;
    chunks: Uint8Array[];
    lastBytes: number;
    lastTime: number;
    speed: number;
  }>();

  public isConnected: boolean = false;

  constructor(callbacks: PeerCallbacks) {
    this.callbacks = callbacks;
  }

  public connect(roomId: string, isInitiator: boolean) {
    this.disconnect();
    this.isInitiator = isInitiator;
    this.callbacks.onStatusChange('waiting');

    // Build WebSocket URL
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/ws?room=${encodeURIComponent(roomId)}`;

    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      if (this.isInitiator) {
        this.callbacks.onStatusChange('waiting');
      } else {
        this.callbacks.onStatusChange('connecting');
      }
    };

    this.ws.onmessage = async (event) => {
      try {
        const msg = JSON.parse(event.data);
        await this.handleSignalingMessage(msg);
      } catch (err) {
        console.error('Signaling parse error:', err);
      }
    };

    this.ws.onerror = () => {
      this.callbacks.onError('Could not connect to signaling service.');
    };

    this.ws.onclose = () => {
      if (this.isConnected) {
        this.disconnect();
      }
    };
  }

  private async handleSignalingMessage(msg: any) {
    if (msg.type === 'peer-joined') {
      // Peer connected to room! If host, create offer
      if (this.isInitiator) {
        this.callbacks.onStatusChange('connecting');
        this.initPeerConnection(true);
        const offer = await this.pc!.createOffer();
        await this.pc!.setLocalDescription(offer);
        this.sendSignal({ type: 'offer', sdp: offer });
      }
    } else if (msg.type === 'offer') {
      if (!this.isInitiator) {
        this.callbacks.onStatusChange('connecting');
        this.initPeerConnection(false);
        await this.pc!.setRemoteDescription(new RTCSessionDescription(msg.sdp));
        const answer = await this.pc!.createAnswer();
        await this.pc!.setLocalDescription(answer);
        this.sendSignal({ type: 'answer', sdp: answer });
      }
    } else if (msg.type === 'answer') {
      if (this.pc && this.pc.signalingState !== 'stable') {
        await this.pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
      }
    } else if (msg.type === 'candidate') {
      if (this.pc && msg.candidate) {
        try {
          await this.pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
        } catch {}
      }
    } else if (msg.type === 'peer-left') {
      this.callbacks.onError('Peer left the room.');
      this.disconnect();
    }
  }

  private sendSignal(msg: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  private initPeerConnection(isHost: boolean) {
    if (this.pc) return;

    this.pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.cloudflare.com:3478' },
        { urls: 'stun:stun.l.google.com:19302' },
      ],
    });

    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.sendSignal({ type: 'candidate', candidate: event.candidate.toJSON() });
      }
    };

    this.pc.onconnectionstatechange = () => {
      const state = this.pc?.connectionState;
      if (state === 'disconnected' || state === 'failed' || state === 'closed') {
        this.callbacks.onStatusChange('disconnected');
        this.isConnected = false;
      }
    };

    if (isHost) {
      const dc = this.pc.createDataChannel('flash-transfer', { ordered: true });
      this.setupDataChannel(dc);
    } else {
      this.pc.ondatachannel = (event) => {
        this.setupDataChannel(event.channel);
      };
    }
  }

  private setupDataChannel(channel: RTCDataChannel) {
    this.channel = channel;
    channel.binaryType = 'arraybuffer';
    channel.bufferedAmountLowThreshold = BUFFER_THRESHOLD;

    channel.onopen = () => {
      this.isConnected = true;
      this.callbacks.onStatusChange('connected');
      // Send handshake
      this.sendControl({ type: 'PING' });
    };

    channel.onclose = () => {
      this.isConnected = false;
      this.callbacks.onStatusChange('disconnected');
    };

    channel.onmessage = (event) => {
      if (typeof event.data === 'string') {
        this.handleControlMessage(event.data);
      } else if (event.data instanceof ArrayBuffer) {
        this.handleBinaryChunk(event.data);
      }
    };
  }

  private sendControl(msg: any) {
    if (this.channel && this.channel.readyState === 'open') {
      this.channel.send(JSON.stringify(msg));
    }
  }

  private handleControlMessage(text: string) {
    try {
      const msg = JSON.parse(text);
      if (msg.type === 'PING') {
        this.sendControl({ type: 'PONG' });
      } else if (msg.type === 'FILE_HEADER') {
        const info: FileInfo = msg.file;
        this.incomingFiles.set(info.id, {
          info,
          receivedBytes: 0,
          chunks: [],
          lastBytes: 0,
          lastTime: performance.now(),
          speed: 0,
        });

        this.callbacks.onIncomingFile({
          fileId: info.id,
          name: info.name,
          size: info.size,
          progress: 0,
          speed: 0,
          status: 'transferring',
        });
      }
    } catch (err) {
      console.error('Control message parse error:', err);
    }
  }

  private handleBinaryChunk(buffer: ArrayBuffer) {
    if (buffer.byteLength < 24) return;
    const view = new DataView(buffer);
    const magic = view.getUint32(0);
    if (magic !== MAGIC_HEADER) return;

    const idBytes = new Uint8Array(buffer, 4, 16);
    const fileId = new TextDecoder().decode(idBytes).trim();
    const payload = new Uint8Array(buffer, 24);

    const session = this.incomingFiles.get(fileId);
    if (!session) return;

    session.chunks.push(payload);
    session.receivedBytes += payload.byteLength;

    // Calculate real-time transfer speed
    const now = performance.now();
    const timeDelta = (now - session.lastTime) / 1000;
    if (timeDelta >= 0.25) {
      const bytesDelta = session.receivedBytes - session.lastBytes;
      session.speed = bytesDelta / timeDelta;
      session.lastBytes = session.receivedBytes;
      session.lastTime = now;
    }

    const pct = Math.min(100, Math.round((session.receivedBytes / session.info.size) * 100));

    if (session.receivedBytes >= session.info.size) {
      // Assemble completed blob
      const blob = new Blob(session.chunks as BlobPart[], { type: session.info.mime || 'application/octet-stream' });
      const url = URL.createObjectURL(blob);

      // Auto trigger download for seamless UX
      const a = document.createElement('a');
      a.href = url;
      a.download = session.info.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      this.callbacks.onIncomingProgress({
        fileId: session.info.id,
        name: session.info.name,
        size: session.info.size,
        progress: 100,
        speed: session.speed,
        status: 'completed',
        url,
      });

      this.incomingFiles.delete(fileId);
    } else {
      this.callbacks.onIncomingProgress({
        fileId: session.info.id,
        name: session.info.name,
        size: session.info.size,
        progress: pct,
        speed: session.speed,
        status: 'transferring',
      });
    }
  }

  public async sendFile(file: File): Promise<void> {
    if (!this.channel || this.channel.readyState !== 'open') {
      throw new Error('Not connected to peer');
    }

    const fileId = Math.random().toString(36).substring(2, 10);
    const totalBytes = file.size;

    // 1. Send File Header
    this.sendControl({
      type: 'FILE_HEADER',
      file: {
        id: fileId,
        name: file.name,
        size: totalBytes,
        mime: file.type || 'application/octet-stream',
      },
    });

    this.callbacks.onOutgoingProgress({
      fileId,
      name: file.name,
      size: totalBytes,
      progress: 0,
      speed: 0,
      status: 'transferring',
    });

    let offset = 0;
    let chunkIndex = 0;
    let lastBytes = 0;
    let lastTime = performance.now();
    let speed = 0;

    while (offset < totalBytes) {
      const end = Math.min(offset + CHUNK_SIZE, totalBytes);
      const slice = file.slice(offset, end);
      const chunkBuffer = await slice.arrayBuffer();

      // Build 24-byte packet header
      const packet = new Uint8Array(24 + chunkBuffer.byteLength);
      const view = new DataView(packet.buffer);
      view.setUint32(0, MAGIC_HEADER);
      view.setUint32(20, chunkIndex);

      // Copy 16-byte ASCII padded fileId
      const idEncoded = new TextEncoder().encode(fileId.padEnd(16, ' '));
      packet.set(idEncoded, 4);
      packet.set(new Uint8Array(chunkBuffer), 24);

      // Backpressure check
      if (this.channel.bufferedAmount > BUFFER_THRESHOLD) {
        await new Promise<void>((resolve) => {
          const handler = () => {
            this.channel?.removeEventListener('bufferedamountlow', handler);
            resolve();
          };
          this.channel?.addEventListener('bufferedamountlow', handler);
        });
      }

      this.channel.send(packet.buffer);
      offset = end;
      chunkIndex++;

      // Speed calculation
      const now = performance.now();
      const timeDelta = (now - lastTime) / 1000;
      if (timeDelta >= 0.25) {
        const bytesDelta = offset - lastBytes;
        speed = bytesDelta / timeDelta;
        lastBytes = offset;
        lastTime = now;
      }

      const pct = Math.min(100, Math.round((offset / totalBytes) * 100));
      this.callbacks.onOutgoingProgress({
        fileId,
        name: file.name,
        size: totalBytes,
        progress: pct,
        speed,
        status: pct >= 100 ? 'completed' : 'transferring',
      });
    }
  }

  public disconnect() {
    this.isConnected = false;
    if (this.channel) {
      try {
        this.channel.close();
      } catch {}
      this.channel = null;
    }
    if (this.pc) {
      try {
        this.pc.close();
      } catch {}
      this.pc = null;
    }
    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
      this.ws = null;
    }
    this.incomingFiles.clear();
    this.callbacks.onStatusChange('disconnected');
  }
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

export function formatSpeed(bytesPerSec: number): string {
  if (!bytesPerSec || bytesPerSec <= 0) return '0 KB/s';
  return `${formatBytes(bytesPerSec)}/s`;
}
