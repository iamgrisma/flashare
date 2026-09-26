import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { WebSocketServer, WebSocket } from 'ws';

function localSignalingPlugin(): Plugin {
  return {
    name: 'local-signaling',
    configureServer(server) {
      // 1. Defensive MIME-type override for Windows registry glitches
      server.middlewares.use((req, res, next) => {
        const url = req.url || '';
        if (/\.(js|mjs|ts|tsx)(\?.*)?$/.test(url) || url.includes('/@vite/') || url.includes('/src/')) {
          const origSetHeader = res.setHeader;
          res.setHeader = function (name: string, value: any) {
            if (name.toLowerCase() === 'content-type' && String(value).includes('octet-stream')) {
              return origSetHeader.call(this, name, 'text/javascript');
            }
            return origSetHeader.call(this, name, value);
          };
        }
        next();
      });

      // 2. WebSocket signaling for local P2P development
      if (!server.httpServer) return;
      const wss = new WebSocketServer({ noServer: true });
      const rooms = new Map<string, Set<WebSocket>>();

      server.httpServer.on('upgrade', (req, socket, head) => {
        const url = new URL(req.url || '', `http://${req.headers.host}`);
        if (url.pathname.startsWith('/api/ws')) {
          wss.handleUpgrade(req, socket, head, (ws) => {
            wss.emit('connection', ws, req);
          });
        }
      });

      wss.on('connection', (ws, req) => {
        const url = new URL(req.url || '', `http://${req.headers.host}`);
        const room = url.searchParams.get('room')?.toUpperCase() || 'DEFAULT';

        if (!rooms.has(room)) rooms.set(room, new Set());
        const peers = rooms.get(room)!;
        peers.add(ws);

        ws.on('message', (data) => {
          for (const peer of peers) {
            if (peer !== ws && peer.readyState === WebSocket.OPEN) {
              peer.send(data);
            }
          }
        });

        ws.on('close', () => {
          peers.delete(ws);
          if (peers.size === 0) {
            rooms.delete(room);
          } else {
            for (const peer of peers) {
              if (peer.readyState === WebSocket.OPEN) {
                peer.send(JSON.stringify({ type: 'peer-left' }));
              }
            }
          }
        });

        if (peers.size > 1) {
          for (const peer of peers) {
            if (peer.readyState === WebSocket.OPEN) {
              peer.send(JSON.stringify({ type: 'peer-joined' }));
            }
          }
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), localSignalingPlugin()],
  server: {
    port: 3000,
    host: '0.0.0.0',
  },
  build: {
    outDir: 'dist',
  },
});
