export interface ManifestFile {
  id: string;
  name: string;
  size: number;
  mime: string;
  timestamp?: number;
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
  timestamp?: number;
}

export interface ChatMessage {
  id: string;
  sender: 'me' | 'peer';
  text: string;
  timestamp: number;
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
  onChatMessage: (msg: ChatMessage) => void;
  onError: (msg: string) => void;
}

const CHUNK_SIZE = 64 * 1024; // 64 KB high-throughput chunks
const BUFFER_THRESHOLD = 512 * 1024; // 512 KB backpressure threshold
const MAGIC_HEADER = 0x464c4153; // "FLAS"

const PEER_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.cloudflare.com:3478' },
    { urls: 'stun:stun.l.google.com:19302' },
  ],
};

function gatherCompleteDescription(
  pc: RTCPeerConnection,
  timeoutMs = 1500
): Promise<RTCSessionDescriptionInit> {
  if (pc.iceGatheringState === 'complete' && pc.localDescription) {
    return Promise.resolve(pc.localDescription);
  }
  return new Promise((resolve) => {
    let timeout: any;
    const checkState = () => {
      if (pc.iceGatheringState === 'complete' && pc.localDescription) {
        cleanup();
        resolve(pc.localDescription);
      }
    };
    const onCandidate = (e: RTCPeerConnectionIceEvent) => {
      if (!e.candidate && pc.localDescription) {
        cleanup();
        resolve(pc.localDescription);
      }
    };
    const cleanup = () => {
      clearTimeout(timeout);
      pc.removeEventListener('icegatheringstatechange', checkState);
      pc.removeEventListener('icecandidate', onCandidate);
    };

    pc.addEventListener('icegatheringstatechange', checkState);
    pc.addEventListener('icecandidate', onCandidate);

    timeout = setTimeout(() => {
      cleanup();
      resolve(pc.localDescription || { type: 'offer', sdp: '' });
    }, timeoutMs);
  });
}

export class P2PManager {
  private pc: RTCPeerConnection | null = null;
  private channel: RTCDataChannel | null = null;
  private callbacks: P2PCallbacks;
  private pollInterval: any = null;
  private heartbeatTimer: any = null;

  public isConnected: boolean = false;
  public isHost: boolean = false;
  public currentRoomCode: string = '';

  private localFiles = new Map<string, { file: File; timestamp: number }>();
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

  constructor(callbacks: P2PCallbacks) {
    this.callbacks = callbacks;
  }

  // -------------------------------------------------------------
  // Host Flow (Generates Offer -> Redis -> Polls Answer)
  // -------------------------------------------------------------
  public async startHost(roomCode: string) {
    const cleanCode = roomCode.toUpperCase();
    if (this.currentRoomCode && this.currentRoomCode !== cleanCode) {
      this.clearAllFiles();
    }
    this.disconnect(false);
    this.isHost = true;
    this.currentRoomCode = cleanCode;
    this.callbacks.onStatusChange('waiting');

    try {
      const pc = new RTCPeerConnection(PEER_CONFIG);
      this.pc = pc;

      // Create data channel on Host
      const channel = pc.createDataChannel('flash-transfer', { ordered: true });
      this.setupDataChannel(channel);

      this.setupPeerListeners(pc);

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const completeOffer = await gatherCompleteDescription(pc);

      // Post offer to Redis signaling mailbox
      const res = await fetch('/api/signal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: this.currentRoomCode,
          type: 'offer',
          data: completeOffer,
          ttl: 300,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `Server error: ${res.status}`);
      }

      // Poll for joiner's answer
      this.startPollingForAnswer();
    } catch (err: any) {
      console.error('Failed to start host:', err);
      this.callbacks.onError(`Host initialization error: ${err.message || err}`);
      this.callbacks.onStatusChange('disconnected');
    }
  }

  private startPollingForAnswer() {
    this.stopPolling();
    let attempts = 0;
    const maxAttempts = 150; // ~90 seconds

    this.pollInterval = setInterval(async () => {
      if (this.isConnected || !this.pc) {
        this.stopPolling();
        return;
      }
      attempts++;
      if (attempts > maxAttempts) {
        this.stopPolling();
        return;
      }

      try {
        const res = await fetch(`/api/signal?code=${this.currentRoomCode}&type=answer`);
        if (!res.ok) return;
        const json = await res.json();
        if (json?.data && this.pc && !this.isConnected) {
          this.stopPolling();
          await this.pc.setRemoteDescription(new RTCSessionDescription(json.data));
          // Clean up Redis keys
          fetch(`/api/signal?code=${this.currentRoomCode}`, { method: 'DELETE' }).catch(() => {});
        }
      } catch {}
    }, 600);
  }

  // -------------------------------------------------------------
  // Joiner Flow (Polls Offer -> Sets Remote -> Posts Answer)
  // -------------------------------------------------------------
  public async joinRoom(roomCode: string) {
    const cleanCode = roomCode.toUpperCase();
    if (this.currentRoomCode && this.currentRoomCode !== cleanCode) {
      this.clearAllFiles();
    }
    this.disconnect(false);
    this.isHost = false;
    this.currentRoomCode = cleanCode;
    this.callbacks.onStatusChange('connecting');

    let attempts = 0;
    const maxAttempts = 50; // ~30 seconds

    this.stopPolling();
    this.pollInterval = setInterval(async () => {
      if (this.isConnected) {
        this.stopPolling();
        return;
      }
      attempts++;
      if (attempts > maxAttempts) {
        this.stopPolling();
        this.callbacks.onError('Room not found or host not ready. Please verify the code.');
        this.callbacks.onStatusChange('disconnected');
        return;
      }

      try {
        const res = await fetch(`/api/signal?code=${this.currentRoomCode}&type=offer`);
        if (res.status === 500) {
          const errJson = await res.json().catch(() => ({}));
          this.stopPolling();
          this.callbacks.onError(errJson.error || 'Server error on signaling endpoint (check Redis credentials)');
          this.callbacks.onStatusChange('disconnected');
          return;
        }
        if (!res.ok) return;
        const json = await res.json();
        if (json?.data && !this.isConnected) {
          this.stopPolling();
          await this.connectWithOffer(json.data);
        }
      } catch {}
    }, 600);
  }

  private async connectWithOffer(offerData: RTCSessionDescriptionInit) {
    try {
      const pc = new RTCPeerConnection(PEER_CONFIG);
      this.pc = pc;

      this.setupPeerListeners(pc);

      pc.ondatachannel = (e) => {
        this.setupDataChannel(e.channel);
      };

      await pc.setRemoteDescription(new RTCSessionDescription(offerData));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      const completeAnswer = await gatherCompleteDescription(pc);

      await fetch('/api/signal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: this.currentRoomCode,
          type: 'answer',
          data: completeAnswer,
          ttl: 300,
        }),
      });
    } catch (err: any) {
      console.error('Failed to answer offer:', err);
      this.callbacks.onError(`Connection failed: ${err.message || err}`);
      this.callbacks.onStatusChange('disconnected');
    }
  }

  // -------------------------------------------------------------
  // PeerConnection Listeners
  // -------------------------------------------------------------
  private setupPeerListeners(pc: RTCPeerConnection) {
    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      if (state === 'connected') {
        this.callbacks.onStatusChange('connected');
      } else if (state === 'failed' || state === 'closed') {
        this.handlePeerDisconnect();
      } else if (state === 'connecting') {
        this.callbacks.onStatusChange('connecting');
      }
    };

    pc.oniceconnectionstatechange = () => {
      const state = pc.iceConnectionState;
      if (state === 'failed' || state === 'disconnected') {
        this.handlePeerDisconnect();
      }
    };
  }

  // -------------------------------------------------------------
  // DataChannel Handling & Binary Packet Demuxing
  // -------------------------------------------------------------
  private setupDataChannel(channel: RTCDataChannel) {
    this.channel = channel;
    channel.binaryType = 'arraybuffer';

    channel.onopen = () => {
      this.isConnected = true;
      this.callbacks.onStatusChange('connected');
      this.startHeartbeat();

      // Exchange initial manifest
      try {
        channel.send(
          JSON.stringify({
            type: 'HANDSHAKE',
            manifest: this.getLocalManifest(),
          })
        );
      } catch (err) {
        console.error('Handshake send failed:', err);
      }
    };

    channel.onmessage = (event) => {
      if (typeof event.data === 'string') {
        this.handleTextMessage(event.data);
      } else if (event.data instanceof ArrayBuffer) {
        this.handleBinaryChunk(event.data);
      }
    };

    channel.onclose = () => {
      this.handlePeerDisconnect();
    };

    channel.onerror = (err) => {
      console.error('DataChannel error:', err);
    };
  }

  private handleTextMessage(raw: string) {
    try {
      const data = JSON.parse(raw);
      if (!data?.type) return;

      if (data.type === 'PING') {
        this.channel?.send(JSON.stringify({ type: 'PONG' }));
        return;
      }
      if (data.type === 'PONG') return;

      if (data.type === 'HANDSHAKE') {
        if (data.manifest) {
          this.callbacks.onRemoteManifest(data.manifest);
        }
        try {
          this.channel?.send(
            JSON.stringify({
              type: 'MANIFEST',
              files: this.getLocalManifest(),
            })
          );
        } catch {}
      } else if (data.type === 'MANIFEST') {
        this.callbacks.onRemoteManifest(data.files || []);
      } else if (data.type === 'CHAT_MESSAGE') {
        this.callbacks.onChatMessage({
          id: data.id || Math.random().toString(36).substring(2, 10),
          sender: 'peer',
          text: data.text || '',
          timestamp: data.timestamp || Date.now(),
        });
      } else if (data.type === 'REQUEST_FILE') {
        this.streamFileToPeer(data.fileId);
      } else if (data.type === 'FILE_START') {
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
      } else if (data.type === 'FILE_END') {
        const stream = this.inboundStreams.get(data.fileId);
        if (stream) {
          const blob = new Blob(stream.chunks, { type: stream.mime });
          const url = URL.createObjectURL(blob);

          // Auto-download for seamless UX
          const a = document.createElement('a');
          a.href = url;
          a.download = stream.name;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);

          this.callbacks.onTransferProgress(data.fileId, 100, stream.speed, 'completed', url);
          this.inboundStreams.delete(data.fileId);
        }
      } else if (data.type === 'DISCONNECT_NOTICE') {
        this.callbacks.onError(data.reason || 'The other device disconnected the session.');
        this.disconnect(true);
      }
    } catch (err) {
      console.error('Error handling message:', err);
    }
  }

  private handleBinaryChunk(buffer: ArrayBuffer) {
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

  // -------------------------------------------------------------
  // High-Speed File Streaming with Adaptive Backpressure
  // -------------------------------------------------------------
  public async streamFileToPeer(fileId: string) {
    const item = this.localFiles.get(fileId);
    if (!item || !this.channel || this.channel.readyState !== 'open') return;

    const { file } = item;
    const totalBytes = file.size;

    // Send Header
    this.channel.send(
      JSON.stringify({
        type: 'FILE_START',
        fileId,
        name: file.name,
        size: totalBytes,
        mime: file.type || 'application/octet-stream',
      })
    );

    this.callbacks.onTransferProgress(fileId, 0, 0, 'transferring');

    let offset = 0;
    let chunkIndex = 0;
    let lastBytes = 0;
    let lastTime = performance.now();
    let speed = 0;

    while (offset < totalBytes) {
      if (!this.isConnected || !this.channel || this.channel.readyState !== 'open') return;

      // Adaptive Backpressure Flow Control
      if (this.channel.bufferedAmount > BUFFER_THRESHOLD) {
        await new Promise<void>((resolve) => {
          const handler = () => {
            this.channel?.removeEventListener('bufferedamountlow', handler);
            resolve();
          };
          this.channel?.addEventListener('bufferedamountlow', handler);
          setTimeout(() => {
            this.channel?.removeEventListener('bufferedamountlow', handler);
            resolve();
          }, 30);
        });
      }

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

    // Signal transfer finish
    this.channel.send(
      JSON.stringify({
        type: 'FILE_END',
        fileId,
      })
    );

    this.callbacks.onTransferProgress(fileId, 100, speed, 'completed');
  }

  // -------------------------------------------------------------
  // Public UI API Methods
  // -------------------------------------------------------------
  public registerLocalFile(id: string, file: File, timestamp: number = Date.now()) {
    this.localFiles.set(id, { file, timestamp });
    this.broadcastManifest();
  }

  public removeLocalFile(id: string) {
    this.localFiles.delete(id);
    this.broadcastManifest();
  }

  public getLocalManifest(): ManifestFile[] {
    const list: ManifestFile[] = [];
    for (const [id, item] of this.localFiles.entries()) {
      list.push({
        id,
        name: item.file.name,
        size: item.file.size,
        mime: item.file.type || 'application/octet-stream',
        timestamp: item.timestamp,
      });
    }
    return list;
  }

  public broadcastManifest() {
    if (!this.channel || this.channel.readyState !== 'open') return;
    try {
      this.channel.send(
        JSON.stringify({
          type: 'MANIFEST',
          files: this.getLocalManifest(),
        })
      );
    } catch (err) {
      console.error('Error broadcasting manifest:', err);
    }
  }

  public requestDownload(fileId: string) {
    if (!this.channel || this.channel.readyState !== 'open') return;
    this.channel.send(
      JSON.stringify({
        type: 'REQUEST_FILE',
        fileId,
      })
    );
  }

  public sendChatMessage(text: string): ChatMessage | null {
    if (!this.channel || this.channel.readyState !== 'open' || !text.trim()) return null;
    const cleanText = text.trim();
    const id = Math.random().toString(36).substring(2, 10);
    const timestamp = Date.now();
    try {
      this.channel.send(
        JSON.stringify({
          type: 'CHAT_MESSAGE',
          id,
          text: cleanText,
          timestamp,
        })
      );
      return { id, sender: 'me', text: cleanText, timestamp };
    } catch {
      return null;
    }
  }

  public reconnect(targetCode?: string) {
    const code = (targetCode || this.currentRoomCode).toUpperCase();
    if (code) {
      if (this.isHost) {
        this.startHost(code);
      } else {
        this.joinRoom(code);
      }
    }
  }

  public clearAllFiles() {
    this.localFiles.clear();
    this.inboundStreams.clear();
  }

  public disconnectPeer(reason = 'Session ended') {
    if (this.channel && this.channel.readyState === 'open') {
      try {
        this.channel.send(JSON.stringify({ type: 'DISCONNECT_NOTICE', reason }));
      } catch {}
    }
    this.disconnect(true);
  }

  public disconnect(intentional = true) {
    this.stopPolling();
    this.stopHeartbeat();
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
    this.inboundStreams.clear();

    if (intentional && this.isHost && this.currentRoomCode) {
      fetch(`/api/signal?code=${this.currentRoomCode}`, { method: 'DELETE' }).catch(() => {});
    }

    if (intentional) {
      this.localFiles.clear();
      this.currentRoomCode = '';
      this.isHost = false;
      this.callbacks.onStatusChange('disconnected');
    }
  }

  private handlePeerDisconnect() {
    if (!this.isConnected && this.pc === null) return;
    this.isConnected = false;
    this.stopHeartbeat();
    this.inboundStreams.clear();
    if (this.channel) {
      try { this.channel.close(); } catch {}
      this.channel = null;
    }
    if (this.pc) {
      try { this.pc.close(); } catch {}
      this.pc = null;
    }

    this.callbacks.onStatusChange('disconnected');
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.channel && this.channel.readyState === 'open') {
        try {
          this.channel.send(JSON.stringify({ type: 'PING' }));
        } catch {}
      }
    }, 5000);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private stopPolling() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
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
  if (!bytesPerSec || bytesPerSec <= 0) return '0 B/s';
  return `${formatBytes(bytesPerSec)}/s`;
}
