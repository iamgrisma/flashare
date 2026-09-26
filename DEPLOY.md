# Deployment Guide: Cloudflare Pages / Workers

FlashTransfer is a pure Vite + React single-page application with native WebRTC data streaming.

## Option 1: Cloudflare Pages (Git Deployment)

1. Connect your repository to **Cloudflare Pages**.
2. Set the build configuration:
   - **Framework preset**: `Vite` (or `None`)
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
3. Click **Deploy**.

`functions/api/ws.ts` automatically handles peer WebSocket signaling.

---

## Option 2: Cloudflare Workers with Assets (Wrangler CLI)

```bash
npm run build
npx wrangler deploy
```

Static assets in `dist/` are served globally by Cloudflare edge caching, and `worker/index.ts` handles WebSocket room signaling.
