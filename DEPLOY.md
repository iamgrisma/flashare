# Deployment Guide: Cloudflare Workers with Assets

FlashTransfer is designed to deploy directly to Cloudflare Workers with Static Assets.

## 1. Prerequisites
- Node.js 18+
- Cloudflare account & Wrangler CLI

## 2. One-Command Build & Deploy
```bash
npm run deploy
```
This executes:
1. `tsc && vite build` -> outputs static optimized client to `dist/`
2. `wrangler deploy` -> deploys static assets to Cloudflare's global edge + deploys `worker/index.ts` for WebSocket signaling.

## 3. Configuration (`wrangler.toml`)
```toml
name = "flashtransfer"
main = "worker/index.ts"
compatibility_date = "2024-09-23"
compatibility_flags = ["nodejs_compat"]

[assets]
directory = "dist"

[durable_objects]
bindings = [
  { name = "ROOMS", class_name = "SignalingRoom" }
]

[[migrations]]
tag = "v1"
new_classes = ["SignalingRoom"]
```

## Why this is 100x better than the old Next.js setup:
- **Instant cold starts**: Pure V8 worker without bulky Node runtime shims.
- **Zero build hacks**: No `@cloudflare/next-on-pages` or tricky vercel adapter configs.
- **Sub-1s build times**: Vite compiles the entire bundle in under 1 second.
- **Reliable WebSocket Signaling**: Durable Objects guarantee that both peers connect to the exact same room instance with zero polling or memory isolation bugs.
