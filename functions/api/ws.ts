export const onRequest = async (context: any) => {
  const { request, env } = context;
  const url = new URL(request.url);
  const room = url.searchParams.get("room")?.toUpperCase() || "DEFAULT";

  if (env.ROOMS) {
    const id = env.ROOMS.idFromName(room);
    const roomObj = env.ROOMS.get(id);
    return roomObj.fetch(request);
  }

  return new Response("WebSocket Signaling endpoint", { status: 200 });
};
