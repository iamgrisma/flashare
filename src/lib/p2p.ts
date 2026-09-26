import Peer, { DataConnection } from 'peerjs';

export interface ManifestFile {
  id: string;
  name: string;
  size: number;
  mime: string;
}

export interface PeerFileItem {
  id: string;
  name: string;
  size: number;
  mime: string;
  progress: number; // 0 - 100
  speed: number;    // bytes / sec
  status: 'idle' | 'transferring' | 'completed' | 'error';
  url?: string;
  isLocal: boolean;
}

export interface P2PCallbacks {
  onStatusChange: (status: 'disconnected' | 'waiting' | 'connecting' | 'connected') => void;
  onRemoteManifest: (manifest: ManifestFile[]) => void;
  onTransferProgress: (
    fileId: string,
    progress: number,
    speed: number,
    status: 'transferring' | 'completed' | 'error',
    url?: string
  ) => void;
  onError: (msg: string) => void;
}

const CHUNK_SIZE = 32 * 1024; // 32 KB for smooth delivery across slow/mobile connections

const PEER_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
    { urls: 'stun:global.stun.twilio.com:3478' },
  ],
  iceCandidatePoolSize: 10,
};

export class P2PManager {
  private peer: Peer | null = null;
  private conn: DataConnection | null = null;
  private callbacks: P2PCallbacks;
  private heartbeatTimer: any = null;

  // Stored local files (fileId -> File)
  private localFiles = new Map<string, File>();

  // Inbound streaming buffers
  private inboundStreams = new Map<
    string,
    {
      name: string;
      size: number;
      mime: string;
      receivedBytes: number;
      chunks: BlobPart[];
      lastBytes: number;
      lastTime: number;
      speed: number;
    }
  >();

  public isConnected: boolean = false;
  public currentRoomCode: string = '';

  constructor(callbacks: P2PCallbacks) {
    this.callbacks = callbacks;
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.conn && this.isConnected) {
        try {
          this.conn.send({ type: 'PING' });
        } catch {}
      }
    }, 6000);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  public registerLocalFile(id: string, file: File) {
    this.localFiles.set(id, file);
    this.broadcastManifest();
  }

  public removeLocalFile(id: string) {
    this.localFiles.delete(id);
    this.broadcastManifest();
  }

  public getLocalManifest(): ManifestFile[] {
    const list: ManifestFile[] = [];
    for (const [id, file] of this.localFiles.entries()) {
      list.push({
        id,
        name: file.name,
        size: file.size,
        mime: file.type || 'application/octet-stream',
      });
    }
    return list;
  }

  public broadcastManifest() {
    if (!this.conn || !this.isConnected) return;
    try {
      this.conn.send({
        type: 'MANIFEST',
        files: this.getLocalManifest(),
      });
    } catch (err) {
      console.error('Error broadcasting manifest:', err);
    }
  }

  /**
   * Host / Creator: listens for incoming connection on `flash-${roomCode}`
   */
  public startHost(roomCode: string) {
    this.disconnect();
    this.currentRoomCode = roomCode.toUpperCase();
    this.callbacks.onStatusChange('waiting');

    const peerId = `flash-${this.currentRoomCode}`;
    const peer = new Peer(peerId, {
      debug: 1,
      config: PEER_CONFIG,
    });

    this.peer = peer;

    peer.on('open', () => {
      this.callbacks.onStatusChange('waiting');
    });

    peer.on('connection', (conn) => {
      this.setupConnection(conn);
    });

    peer.on('error', (err: any) => {
      console.error('PeerJS error on host:', err);
      if (err.type === 'unavailable-id') {
        this.callbacks.onError('Room code already active. Please generate a new code.');
      } else {
        this.callbacks.onError(`Notice: ${err.type || err.message}`);
      }
    });

    peer.on('disconnected', () => {
      // Signaling server disconnected, but WebRTC DataConnection is still alive!
      // Do NOT kill connection, attempt reconnect to signaling in background.
      if (!this.peer?.destroyed) {
        try {
          this.peer?.reconnect();
        } catch {}
      }
    });
  }

  /**
   * Joiner / Receiver: connects to `flash-${roomCode}` with progressive backoff retry
   */
  public joinRoom(roomCode: string) {
    this.disconnect();
    this.currentRoomCode = roomCode.toUpperCase();
    this.callbacks.onStatusChange('connecting');

    const peer = new Peer({
      debug: 1,
      config: PEER_CONFIG,
    });

    this.peer = peer;
    let retries = 0;
    const maxRetries = 6;

    const tryConnect = () => {
      if (!this.peer || this.peer.destroyed) return;
      const targetPeerId = `flash-${this.currentRoomCode}`;
      const conn = peer.connect(targetPeerId, {
        reliable: true,
      });

      this.setupConnection(conn);
    };

    peer.on('open', () => {
      tryConnect();
    });

    peer.on('error', (err: any) => {
      console.error('PeerJS error on joiner:', err);
      if (err.type === 'peer-unavailable' && retries < maxRetries) {
        retries++;
        const delay = 1200 + retries * 600; // 1800ms, 2400ms, 3000ms...
        setTimeout(() => {
          tryConnect();
        }, delay);
      } else {
        this.callbacks.onError(`Could not connect: ${err.message || err.type}`);
        this.callbacks.onStatusChange('disconnected');
      }
    });

    peer.on('disconnected', () => {
      if (!this.peer?.destroyed) {
        try {
          this.peer?.reconnect();
        } catch {}
      }
    });
  }

  private setupConnection(conn: DataConnection) {
    this.conn = conn;

    const handleOpen = () => {
      this.isConnected = true;
      this.callbacks.onStatusChange('connected');
      this.startHeartbeat();
      // Immediately exchange manifests
      const myManifest = this.getLocalManifest();
      try {
        conn.send({
          type: 'HANDSHAKE',
          manifest: myManifest,
        });
      } catch (e) {
        console.error('Error sending handshake:', e);
      }
    };

    // Check if connection is ALREADY open
    if (conn.open) {
      handleOpen();
    } else {
      conn.on('open', handleOpen);
    }

    conn.on('data', (data: any) => {
      this.handleIncomingData(data);
    });

    conn.on('close', () => {
      this.isConnected = false;
      this.stopHeartbeat();
      this.callbacks.onStatusChange('disconnected');
    });

    conn.on('error', (err) => {
      console.error('DataConnection error:', err);
      this.callbacks.onError('Connection interrupted.');
    });
  }

  private handleIncomingData(data: any) {
    if (!data) return;

    if (data.type === 'PING') {
      try {
        this.conn?.send({ type: 'PONG' });
      } catch {}
      return;
    }
    if (data.type === 'PONG') {
      return;
    }

    if (data.type === 'HANDSHAKE') {
      // Received peer's initial manifest
      if (data.manifest) {
        this.callbacks.onRemoteManifest(data.manifest);
      }
      // Respond with my manifest
      try {
        this.conn?.send({
          type: 'MANIFEST',
          files: this.getLocalManifest(),
        });
      } catch (e) {}
    } else if (data.type === 'MANIFEST') {
      // Real-time manifest received from peer
      this.callbacks.onRemoteManifest(data.files || []);
    } else if (data.type === 'REQUEST_FILE') {
      // Peer requested to download fileId
      this.streamFileToPeer(data.fileId);
    } else if (data.type === 'FILE_START') {
      // Stream header
      this.inboundStreams.set(data.fileId, {
        name: data.name,
        size: data.size,
        mime: data.mime || 'application/octet-stream',
        receivedBytes: 0,
        chunks: [],
        lastBytes: 0,
        lastTime: performance.now(),
        speed: 0,
      });
      this.callbacks.onTransferProgress(data.fileId, 0, 0, 'transferring');
    } else if (data.type === 'FILE_CHUNK') {
      // Stream chunk
      const stream = this.inboundStreams.get(data.fileId);
      if (!stream) return;

      const chunkData = data.chunk;
      stream.chunks.push(chunkData);
      const byteLen = chunkData.byteLength ?? chunkData.size ?? (chunkData.length || 0);
      stream.receivedBytes += byteLen;

      // Speed calculation
      const now = performance.now();
      const timeDelta = (now - stream.lastTime) / 1000;
      if (timeDelta >= 0.2) {
        const bytesDelta = stream.receivedBytes - stream.lastBytes;
        stream.speed = bytesDelta / timeDelta;
        stream.lastBytes = stream.receivedBytes;
        stream.lastTime = now;
      }

      const pct = Math.min(100, Math.round((stream.receivedBytes / stream.size) * 100));
      this.callbacks.onTransferProgress(data.fileId, pct, stream.speed, 'transferring');
    } else if (data.type === 'FILE_END') {
      // Stream finished
      const stream = this.inboundStreams.get(data.fileId);
      if (stream) {
        const blob = new Blob(stream.chunks, { type: stream.mime || 'application/octet-stream' });
        const url = URL.createObjectURL(blob);

        // Auto trigger download for seamless UX
        const a = document.createElement('a');
        a.href = url;
        a.download = stream.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        this.callbacks.onTransferProgress(data.fileId, 100, stream.speed, 'completed', url);
        this.inboundStreams.delete(data.fileId);
      }
    }
  }

  public requestDownload(fileId: string) {
    if (!this.conn || !this.isConnected) return;
    this.conn.send({
      type: 'REQUEST_FILE',
      fileId,
    });
  }

  private async streamFileToPeer(fileId: string) {
    const file = this.localFiles.get(fileId);
    if (!file || !this.conn || !this.isConnected) return;

    const totalBytes = file.size;

    // 1. Announce stream start
    this.conn.send({
      type: 'FILE_START',
      fileId,
      name: file.name,
      size: totalBytes,
      mime: file.type || 'application/octet-stream',
    });

    this.callbacks.onTransferProgress(fileId, 0, 0, 'transferring');

    let offset = 0;
    let lastBytes = 0;
    let lastTime = performance.now();
    let speed = 0;

    while (offset < totalBytes) {
      if (!this.isConnected || !this.conn) return;

      // WebRTC DataChannel adaptive backpressure guard (prevents packet loss on slow connections)
      const dc = (this.conn as any)?.dataChannel as RTCDataChannel | undefined;
      if (dc && dc.bufferedAmount > 256 * 1024) {
        await new Promise<void>((resolve) => {
          const check = () => {
            if (!dc || dc.bufferedAmount < 64 * 1024) {
              resolve();
            } else {
              setTimeout(check, 15);
            }
          };
          check();
        });
      }

      const end = Math.min(offset + CHUNK_SIZE, totalBytes);
      const slice = file.slice(offset, end);
      const buffer = await slice.arrayBuffer();

      this.conn.send({
        type: 'FILE_CHUNK',
        fileId,
        chunk: buffer,
      });

      offset = end;

      const now = performance.now();
      const timeDelta = (now - lastTime) / 1000;
      if (timeDelta >= 0.2) {
        const bytesDelta = offset - lastBytes;
        speed = bytesDelta / timeDelta;
        lastBytes = offset;
        lastTime = now;
      }

      const pct = Math.min(100, Math.round((offset / totalBytes) * 100));
      this.callbacks.onTransferProgress(fileId, pct, speed, 'transferring');

      // Yield event loop briefly
      await new Promise((resolve) => setTimeout(resolve, 4));
    }

    // Announce stream finish
    this.conn.send({
      type: 'FILE_END',
      fileId,
    });

    this.callbacks.onTransferProgress(fileId, 100, speed, 'completed');
  }

  public disconnect() {
    this.isConnected = false;
    this.stopHeartbeat();
    if (this.conn) {
      try {
        this.conn.close();
      } catch {}
      this.conn = null;
    }
    if (this.peer) {
      try {
        this.peer.destroy();
      } catch {}
      this.peer = null;
    }
    this.inboundStreams.clear();
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
