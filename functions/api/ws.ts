export const onRequest = async (context: any) => {
  const { request, env } = context;
  if (request.headers.get("Upgrade") !== "websocket") {
    return new Response("Expected WebSocket", { status: 426 });
  }

  const url = new URL(request.url);
  const room = url.searchParams.get("room")?.toUpperCase() || "DEFAULT";

  // 1. If Durable Objects are bound, route to Durable Object
  if (env && env.ROOMS) {
    const id = env.ROOMS.idFromName(room);
    const roomObj = env.ROOMS.get(id);
    return roomObj.fetch(request);
  }

  // 2. Otherwise use native WebSocketPair with in-memory relay
  const pair = new (globalThis as any).WebSocketPair();
  const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
  (server as any).accept();

  const globalScope = globalThis as any;
  if (!globalScope.__rooms) {
    globalScope.__rooms = new Map();
  }
  if (!globalScope.__rooms.has(room)) {
    globalScope.__rooms.set(room, new Set());
  }
  const sessions: Set<WebSocket> = globalScope.__rooms.get(room);
  sessions.add(server);

  server.addEventListener("message", (event: any) => {
    for (const peer of sessions) {
      if (peer !== server) {
        try {
          peer.send(event.data);
        } catch {
          sessions.delete(peer);
        }
      }
    }
  });

  server.addEventListener("close", () => {
    sessions.delete(server);
    if (sessions.size === 0) {
      globalScope.__rooms.delete(room);
    } else {
      for (const peer of sessions) {
        try {
          peer.send(JSON.stringify({ type: "peer-left" }));
        } catch {}
      }
    }
  });

  if (sessions.size > 1) {
    for (const peer of sessions) {
      try {
        peer.send(JSON.stringify({ type: "peer-joined" }));
      } catch {}
    }
  }

  return new Response(null, { status: 101, webSocket: client } as any);
};
