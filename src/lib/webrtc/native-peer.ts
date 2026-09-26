import { RTC_CONFIG, CHUNK_SIZE, BUFFER_THRESHOLD, ControlMessage } from './config';

export class NativeP2PEngine {
  public pc: RTCPeerConnection | null = null;
  public controlChannel: RTCDataChannel | null = null;
  public dataChannel: RTCDataChannel | null = null;
  public isConnected: boolean = false;

  private onControlCallback: ((msg: ControlMessage) => void) | null = null;
  private onDataCallback: ((chunk: ArrayBuffer) => void) | null = null;
  private onStateCallback: ((state: RTCPeerConnectionState) => void) | null = null;
  private onTrickleCandidateCallback: ((candidate: RTCIceCandidate) => void) | null = null;
  private pendingControlMessages: ControlMessage[] = [];

  constructor() {
    // Empty constructor
  }

  public init(isInitiator: boolean): RTCPeerConnection {
    this.close();

    const pc = new RTCPeerConnection(RTC_CONFIG);
    this.pc = pc;

    pc.onicecandidate = (event) => {
      if (event.candidate && this.onTrickleCandidateCallback) {
        this.onTrickleCandidateCallback(event.candidate);
      }
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      this.isConnected = state === 'connected';
      if (this.onStateCallback) {
        this.onStateCallback(state);
      }
    };

    pc.oniceconnectionstatechange = () => {
      const iceState = pc.iceConnectionState;
      if (iceState === 'connected' || iceState === 'completed') {
        if (this.controlChannel?.readyState === 'open') {
          this.isConnected = true;
          this.onStateCallback?.('connected');
        }
      }
    };

    if (isInitiator) {
      // Initiator creates dedicated channels
      const control = pc.createDataChannel('p2p-control', { ordered: true });
      this.setupControlChannel(control);

      const data = pc.createDataChannel('p2p-data', {
        ordered: true,
        maxRetransmits: 30,
      });
      data.binaryType = 'arraybuffer';
      this.setupDataChannel(data);
    } else {
      // Receiver listens for incoming channels
      pc.ondatachannel = (event) => {
        const channel = event.channel;
        if (channel.label === 'p2p-control') {
          this.setupControlChannel(channel);
        } else if (channel.label === 'p2p-data') {
          channel.binaryType = 'arraybuffer';
          this.setupDataChannel(channel);
        }
      };
    }

    return pc;
  }

  private setupControlChannel(channel: RTCDataChannel) {
    this.controlChannel = channel;
    channel.onopen = () => {
      this.checkChannelsReady();
    };
    channel.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as ControlMessage;
        if (this.onControlCallback) {
          this.onControlCallback(msg);
        }
      } catch (err) {
        console.error('Failed to parse control message:', err);
      }
    };
  }

  private setupDataChannel(channel: RTCDataChannel) {
    this.dataChannel = channel;
    channel.binaryType = 'arraybuffer';
    channel.bufferedAmountLowThreshold = BUFFER_THRESHOLD;
    channel.onopen = () => {
      this.checkChannelsReady();
    };
    channel.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer && this.onDataCallback) {
        this.onDataCallback(event.data);
      }
    };
  }

  private checkChannelsReady() {
    if (this.controlChannel?.readyState === 'open') {
      this.isConnected = true;
      this.flushPendingControlMessages();
      if (this.onStateCallback) {
        this.onStateCallback('connected');
      }
    }
  }

  private flushPendingControlMessages() {
    if (this.controlChannel && this.controlChannel.readyState === 'open' && this.pendingControlMessages.length > 0) {
      const toSend = [...this.pendingControlMessages];
      this.pendingControlMessages = [];
      for (const msg of toSend) {
        try {
          this.controlChannel.send(JSON.stringify(msg));
        } catch (err) {
          console.error('Failed to flush control message:', err);
        }
      }
    }
  }

  public setCallbacks(opts: {
    onControl: (msg: ControlMessage) => void;
    onData: (chunk: ArrayBuffer) => void;
    onState: (state: RTCPeerConnectionState) => void;
    onTrickleCandidate?: (candidate: RTCIceCandidate) => void;
  }) {
    this.onControlCallback = opts.onControl;
    this.onDataCallback = opts.onData;
    this.onStateCallback = opts.onState;
    if (opts.onTrickleCandidate) {
      this.onTrickleCandidateCallback = opts.onTrickleCandidate;
    }
    // If already connected when callbacks are registered, immediately fire state callback!
    if (this.isConnected || this.controlChannel?.readyState === 'open') {
      this.isConnected = true;
      opts.onState('connected');
      this.flushPendingControlMessages();
    }
  }

  public sendControl(msg: ControlMessage) {
    if (this.controlChannel && this.controlChannel.readyState === 'open') {
      try {
        this.controlChannel.send(JSON.stringify(msg));
      } catch (err) {
        console.error('Failed to send control message:', err);
      }
    } else {
      // Queue until controlChannel opens
      this.pendingControlMessages.push(msg);
    }
  }

  /**
   * Backpressure-controlled chunk sender.
   * Awaits bufferedAmountLow before pushing if the SCTP buffer exceeds BUFFER_THRESHOLD.
   */
  public async sendChunkWithBackpressure(chunk: ArrayBuffer): Promise<void> {
    const channel = this.dataChannel;
    if (!channel || channel.readyState !== 'open') {
      throw new Error('Data channel not open');
    }

    if (channel.bufferedAmount > BUFFER_THRESHOLD) {
      await new Promise<void>((resolve) => {
        const handler = () => {
          channel.removeEventListener('bufferedamountlow', handler);
          resolve();
        };
        channel.addEventListener('bufferedamountlow', handler);
      });
    }

    channel.send(chunk);
  }

  /**
   * High-performance file streaming reader using FileReader or ReadableStream
   */
  public async streamFile(
    file: File,
    fileId: string,
    onProgress: (sentBytes: number, totalBytes: number) => void,
    isCancelled: () => boolean
  ): Promise<void> {
    const totalBytes = file.size;
    const totalChunks = Math.ceil(totalBytes / CHUNK_SIZE);

    // 1. Notify control channel that transfer is starting
    this.sendControl({
      type: 'transfer-start',
      payload: {
        fileId,
        name: file.name,
        size: file.size,
        mimeType: file.type || 'application/octet-stream',
        totalChunks,
      },
    });

    let offset = 0;
    let chunkIndex = 0;

    while (offset < totalBytes) {
      if (isCancelled()) {
        this.sendControl({
          type: 'transfer-cancel',
          payload: { fileId },
        });
        return;
      }

      const end = Math.min(offset + CHUNK_SIZE, totalBytes);
      const slice = file.slice(offset, end);
      const buffer = await slice.arrayBuffer();

      // Encode header: 4 bytes magic (0x01), 16 bytes fileId (padded/truncated), 4 bytes chunkIndex
      const header = new ArrayBuffer(24);
      const view = new DataView(header);
      view.setUint32(0, 0x50325031); // 'P2P1' magic bytes
      view.setUint32(20, chunkIndex);

      // Copy fileId as 16 ascii chars
      const idBytes = new TextEncoder().encode(fileId.slice(0, 16).padEnd(16, ' '));
      new Uint8Array(header, 4, 16).set(idBytes);

      // Concat header + chunk payload
      const combined = new Uint8Array(24 + buffer.byteLength);
      combined.set(new Uint8Array(header), 0);
      combined.set(new Uint8Array(buffer), 24);

      await this.sendChunkWithBackpressure(combined.buffer);

      offset = end;
      chunkIndex++;
      onProgress(offset, totalBytes);
    }

    // Notify completion
    this.sendControl({
      type: 'transfer-complete',
      payload: {
        fileId,
        name: file.name,
        size: file.size,
      },
    });
  }

  public close() {
    this.isConnected = false;
    if (this.controlChannel) {
      try {
        this.controlChannel.close();
      } catch {}
      this.controlChannel = null;
    }
    if (this.dataChannel) {
      try {
        this.dataChannel.close();
      } catch {}
      this.dataChannel = null;
    }
    if (this.pc) {
      try {
        this.pc.close();
      } catch {}
      this.pc = null;
    }
  }
}
