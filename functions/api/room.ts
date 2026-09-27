interface Env {
  UPSTASH_REDIS_REST_URL?: string;
  UPSTASH_REDIS_REST_TOKEN?: string;
}

export const onRequestGet = async (context: { request: Request; env: Env }) => {
  const { request, env } = context;
  const url = new URL(request.url);
  const code = url.searchParams.get('code')?.toUpperCase();

  if (!code || code.length !== 5) {
    return new Response(JSON.stringify({ error: 'Valid 5-character code required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) {
    // If Redis is not yet configured, return configured: false
    return new Response(JSON.stringify({ peerId: null, configured: false }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const res = await fetch(`${env.UPSTASH_REDIS_REST_URL}/get/room:${code}`, {
      headers: { Authorization: `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}` },
    });
    const data: any = await res.json();
    return new Response(JSON.stringify({ peerId: data.result || null, configured: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const onRequestPost = async (context: { request: Request; env: Env }) => {
  const { request, env } = context;
  try {
    const body: any = await request.json();
    const code = body.code?.toUpperCase();
    const peerId = body.peerId;
    const ttl = body.ttl || 1800; // 30 minutes default

    if (!code || !peerId) {
      return new Response(JSON.stringify({ error: 'code and peerId required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) {
      return new Response(JSON.stringify({ success: false, configured: false }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const res = await fetch(
      `${env.UPSTASH_REDIS_REST_URL}/set/room:${code}/${encodeURIComponent(peerId)}?EX=${ttl}`,
      {
        headers: { Authorization: `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}` },
      }
    );
    const data: any = await res.json();
    return new Response(JSON.stringify({ success: true, result: data.result, configured: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const onRequestDelete = async (context: { request: Request; env: Env }) => {
  const { request, env } = context;
  const url = new URL(request.url);
  const code = url.searchParams.get('code')?.toUpperCase();

  if (!code || !env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) {
    return new Response(JSON.stringify({ success: false }), { status: 200 });
  }

  try {
    await fetch(`${env.UPSTASH_REDIS_REST_URL}/del/room:${code}`, {
      headers: { Authorization: `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}` },
    });
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch {
    return new Response(JSON.stringify({ success: false }), { status: 500 });
  }
};
