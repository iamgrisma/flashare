/**
 * Standard WebRTC ICE Configuration
 * Includes Google and Cloudflare STUN servers, plus optional custom TURN credentials
 */
export const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
  ],
  iceCandidatePoolSize: 10,
};

// Binary chunk protocol:
// 4 bytes: Message Type (0x01 = File Chunk, 0x02 = Chunk Ack, 0x03 = End of Stream)
// 16 bytes: Transfer ID (UUID / ASCII 16 chars)
// 8 bytes: Chunk Index (BigInt64 or 2x Uint32)
// Rest: Payload data (up to 64KB)

export const CHUNK_SIZE = 64 * 1024; // 64 KB per chunk (optimal for SCTP throughput without fragment congestion)
export const BUFFER_THRESHOLD = 256 * 1024; // 256 KB backpressure high watermark

export type ControlMessage =
  | { type: 'file-metadata'; payload: { id: string; name: string; size: number; mimeType: string }[] }
  | { type: 'request-file'; payload: { fileId: string; startChunk?: number } }
  | { type: 'transfer-start'; payload: { fileId: string; name: string; size: number; mimeType: string; totalChunks: number } }
  | { type: 'transfer-progress'; payload: { fileId: string; chunkIndex: number; totalChunks: number } }
  | { type: 'transfer-complete'; payload: { fileId: string; name: string; size: number } }
  | { type: 'transfer-cancel'; payload: { fileId: string } }
  | { type: 'ping'; payload: { timestamp: number } }
  | { type: 'pong'; payload: { timestamp: number } };

export interface ManagedP2PConnection {
  pc: RTCPeerConnection;
  controlChannel: RTCDataChannel;
  dataChannel: RTCDataChannel;
  onControlMessage: (msg: ControlMessage) => void;
  onDataChunk: (chunk: ArrayBuffer) => void;
  onStateChange: (state: RTCPeerConnectionState) => void;
  sendControl: (msg: ControlMessage) => void;
  sendChunk: (data: ArrayBuffer) => Promise<void>;
  close: () => void;
}
