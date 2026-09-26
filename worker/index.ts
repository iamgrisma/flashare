export interface Env {
  ROOMS: DurableObjectNamespace;
}

export class SignalingRoom {
  state: DurableObjectState;
  sessions: Set<WebSocket> = new Set();

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();
    this.sessions.add(server);

    server.addEventListener("message", (event) => {
      for (const peer of this.sessions) {
        if (peer !== server) {
          try {
            peer.send(event.data);
          } catch {
            this.sessions.delete(peer);
          }
        }
      }
    });

    server.addEventListener("close", () => {
      this.sessions.delete(server);
      for (const peer of this.sessions) {
        try {
          peer.send(JSON.stringify({ type: "peer-left" }));
        } catch {}
      }
    });

    if (this.sessions.size > 1) {
      for (const peer of this.sessions) {
        try {
          peer.send(JSON.stringify({ type: "peer-joined" }));
        } catch {}
      }
    }

    return new Response(null, { status: 101, webSocket: client });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/ws")) {
      const room = url.searchParams.get("room")?.toUpperCase() || "DEFAULT";
      if (!env.ROOMS) {
        return new Response("Durable Objects not configured", { status: 500 });
      }
      const id = env.ROOMS.idFromName(room);
      const roomObj = env.ROOMS.get(id);
      return roomObj.fetch(request);
    }

    return new Response("FlashTransfer Worker API", { status: 200 });
  },
};
