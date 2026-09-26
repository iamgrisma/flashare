# FlashTransfer

Ultra-lightweight, zero-bloat peer-to-peer file streaming web application. Powered by native WebRTC DataChannels and Cloudflare Workers.

## Key Features

- 🔄 **Truly Symmetric P2P**: Both devices can send and receive files simultaneously.
- ⚡ **Direct Browser-to-Browser Streaming**: Files are streamed directly over SCTP data channels with backpressure control. No intermediate cloud storage.
- 📱 **Seamless QR Scan & Auto-Join**: Scan the QR code with any mobile camera; it instantly opens the room and connects without manual code entry.
- 🔒 **End-to-End Encrypted**: Standard WebRTC DTLS/SCTP encryption.
- 🚀 **Zero-Bloat Stack**: Under 400 lines of clean, readable code. Built with Vite, React, and Tailwind CSS.
- 🌐 **Cloudflare Workers Ready**: Direct deployment to Cloudflare Workers with Static Assets.

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Start Local Development
```bash
npm run dev
```
Runs both the Vite frontend and local WebSocket signaling relay at `http://localhost:3000` (ready in <300ms).

### 3. Build & Deploy to Cloudflare Workers
```bash
npm run build
npm run deploy
```

## Architecture

- **`src/lib/webrtc.ts`**: Pure native `RTCPeerConnection` and `RTCDataChannel` manager with 64KB chunk streaming and `bufferedAmountLow` backpressure flow control.
- **`src/components/QRScannerModal.tsx`**: Lightweight camera QR scanner using `jsQR`.
- **`src/App.tsx`**: Symmetric transfer interface with live progress bars, speed tracking, and drag-and-drop file transfers.
- **`worker/index.ts`**: Ephemeral Cloudflare Worker WebSocket room signaling using Durable Objects.
- **`vite.config.ts`**: Integrated local WebSocket signaling for instant standalone offline development.

## License
MIT
