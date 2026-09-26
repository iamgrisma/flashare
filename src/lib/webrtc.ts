export interface ManifestFile {
  id: string;
  name: string;
  size: number;
  mime: string;
}

export interface PeerFileState {
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

export interface WebRTCEventCallbacks {
  onStatusChange: (status: 'disconnected' | 'waiting' | 'connecting' | 'connected') => void;
  onRemoteManifest: (files: ManifestFile[]) => void;
  onTransferProgress: (fileId: string, progress: number, speed: number, status: 'transferring' | 'completed' | 'error', url?: string) => void;
  onError: (msg: string) => void;
}

const CHUNK_SIZE = 64 * 1024; // 64 KB
const BUFFER_THRESHOLD = 1024 * 1024; // 1 MB backpressure
const MAGIC_HEADER = 0x464c4153; // "FLAS"

export class WebRTCManager {
  private ws: WebSocket | null = null;
  private pc: RTCPeerConnection | null = null;
  private channel: RTCDataChannel | null = null;
  private isInitiator: boolean = false;
  private callbacks: WebRTCEventCallbacks;

  // Local file storage (fileId -> File)
  private localFiles = new Map<string, File>();

  // Inbound streaming buffers (fileId -> { chunks, receivedBytes, totalBytes, mime, name, speed tracking })
  private inboundStreams = new Map<string, {
    name: string;
    size: number;
    mime: string;
    receivedBytes: number;
    chunks: BlobPart[];
    lastBytes: number;
    lastTime: number;
    speed: number;
  }>();

  public isConnected: boolean = false;

  constructor(callbacks: WebRTCEventCallbacks) {
    this.callbacks = callbacks;
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
    if (!this.channel || this.channel.readyState !== 'open') return;
    const manifest = this.getLocalManifest();
    this.sendControl({
      type: 'MANIFEST',
      files: manifest,
    });
  }

  public connect(roomId: string, isInitiator: boolean) {
    this.disconnect();
    this.isInitiator = isInitiator;
    this.callbacks.onStatusChange('waiting');

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/ws?room=${encodeURIComponent(roomId)}`;

    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      this.callbacks.onStatusChange(this.isInitiator ? 'waiting' : 'connecting');
    };

    this.ws.onmessage = async (event) => {
      try {
        const msg = JSON.parse(event.data);
        await this.handleSignaling(msg);
      } catch (err) {
        console.error('Signaling parse error:', err);
      }
    };

    this.ws.onerror = () => {
      this.callbacks.onError('Unable to connect to signaling service.');
    };

    this.ws.onclose = () => {
      if (this.isConnected) {
        this.disconnect();
      }
    };
  }

  private async handleSignaling(msg: any) {
    if (msg.type === 'peer-joined') {
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
      this.callbacks.onError('Peer disconnected from room.');
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
      this.setupChannel(dc);
    } else {
      this.pc.ondatachannel = (event) => {
        this.setupChannel(event.channel);
      };
    }
  }

  private setupChannel(channel: RTCDataChannel) {
    this.channel = channel;
    channel.binaryType = 'arraybuffer';
    channel.bufferedAmountLowThreshold = BUFFER_THRESHOLD;

    channel.onopen = () => {
      this.isConnected = true;
      this.callbacks.onStatusChange('connected');
      // Immediately exchange manifests
      this.broadcastManifest();
      // Send handshake
      this.sendControl({ type: 'READY' });
    };

    channel.onclose = () => {
      this.isConnected = false;
      this.callbacks.onStatusChange('disconnected');
    };

    channel.onmessage = (event) => {
      if (typeof event.data === 'string') {
        this.handleControl(event.data);
      } else if (event.data instanceof ArrayBuffer) {
        this.handleChunk(event.data);
      }
    };
  }

  private sendControl(msg: any) {
    if (this.channel && this.channel.readyState === 'open') {
      this.channel.send(JSON.stringify(msg));
    }
  }

  private handleControl(raw: string) {
    try {
      const msg = JSON.parse(raw);
      if (msg.type === 'READY') {
        // Resend manifest to ensure arrival
        this.broadcastManifest();
      } else if (msg.type === 'MANIFEST') {
        // Peer updated their manifest in realtime!
        this.callbacks.onRemoteManifest(msg.files || []);
      } else if (msg.type === 'REQUEST_FILE') {
        // Peer requested to download a specific file
        this.streamLocalFileToPeer(msg.fileId);
      } else if (msg.type === 'FILE_START') {
        // Peer started streaming a file
        this.inboundStreams.set(msg.fileId, {
          name: msg.name,
          size: msg.size,
          mime: msg.mime || 'application/octet-stream',
          receivedBytes: 0,
          chunks: [],
          lastBytes: 0,
          lastTime: performance.now(),
          speed: 0,
        });
        this.callbacks.onTransferProgress(msg.fileId, 0, 0, 'transferring');
      } else if (msg.type === 'FILE_END') {
        // Peer finished streaming a file
        const stream = this.inboundStreams.get(msg.fileId);
        if (stream) {
          const blob = new Blob(stream.chunks, { type: stream.mime });
          const url = URL.createObjectURL(blob);

          // Auto-trigger browser download
          const a = document.createElement('a');
          a.href = url;
          a.download = stream.name;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);

          this.callbacks.onTransferProgress(msg.fileId, 100, stream.speed, 'completed', url);
          this.inboundStreams.delete(msg.fileId);
        }
      }
    } catch (err) {
      console.error('Control error:', err);
    }
  }

  private handleChunk(buffer: ArrayBuffer) {
    if (buffer.byteLength < 24) return;
    const view = new DataView(buffer);
    if (view.getUint32(0) !== MAGIC_HEADER) return;

    const idBytes = new Uint8Array(buffer, 4, 16);
    const fileId = new TextDecoder().decode(idBytes).trim();
    const payload = new Uint8Array(buffer, 24);

    const stream = this.inboundStreams.get(fileId);
    if (!stream) return;

    stream.chunks.push(payload);
    stream.receivedBytes += payload.byteLength;

    // Calculate real-time speed
    const now = performance.now();
    const timeDelta = (now - stream.lastTime) / 1000;
    if (timeDelta >= 0.2) {
      const bytesDelta = stream.receivedBytes - stream.lastBytes;
      stream.speed = bytesDelta / timeDelta;
      stream.lastBytes = stream.receivedBytes;
      stream.lastTime = now;
    }

    const pct = Math.min(100, Math.round((stream.receivedBytes / stream.size) * 100));
    this.callbacks.onTransferProgress(fileId, pct, stream.speed, 'transferring');
  }

  public requestDownload(fileId: string) {
    this.sendControl({
      type: 'REQUEST_FILE',
      fileId,
    });
  }

  private async streamLocalFileToPeer(fileId: string) {
    const file = this.localFiles.get(fileId);
    if (!file || !this.channel || this.channel.readyState !== 'open') return;

    const totalBytes = file.size;

    // Announce stream start
    this.sendControl({
      type: 'FILE_START',
      fileId,
      name: file.name,
      size: totalBytes,
      mime: file.type || 'application/octet-stream',
    });

    this.callbacks.onTransferProgress(fileId, 0, 0, 'transferring');

    let offset = 0;
    let chunkIndex = 0;
    let lastBytes = 0;
    let lastTime = performance.now();
    let speed = 0;

    while (offset < totalBytes) {
      const end = Math.min(offset + CHUNK_SIZE, totalBytes);
      const slice = file.slice(offset, end);
      const chunkBuffer = await slice.arrayBuffer();

      const packet = new Uint8Array(24 + chunkBuffer.byteLength);
      const view = new DataView(packet.buffer);
      view.setUint32(0, MAGIC_HEADER);
      view.setUint32(20, chunkIndex);

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
    }

    // Announce stream completion
    this.sendControl({
      type: 'FILE_END',
      fileId,
    });

    this.callbacks.onTransferProgress(fileId, 100, speed, 'completed');
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
