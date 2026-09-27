interface Env {
  UPSTASH_REDIS_REST_URL: string;
  UPSTASH_REDIS_REST_TOKEN: string;
}

export const onRequestGet = async (context: { request: Request; env: Env }) => {
  const { request, env } = context;
  const url = new URL(request.url);
  const code = url.searchParams.get('code')?.toUpperCase();
  const type = url.searchParams.get('type'); // 'offer' | 'answer'

  if (!code || code.length !== 5 || !type) {
    return new Response(JSON.stringify({ error: 'Valid 5-character code and type required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) {
    return new Response(JSON.stringify({ error: 'Redis credentials not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const res = await fetch(env.UPSTASH_REDIS_REST_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(['GET', `flash:${code}:${type}`]),
    });
    const result: any = await res.json();
    return new Response(JSON.stringify({ data: result.result ? JSON.parse(result.result) : null }), {
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
    const type = body.type; // 'offer' | 'answer'
    const data = body.data;
    const ttl = body.ttl || 180; // 3 minutes

    if (!code || code.length !== 5 || !type || !data) {
      return new Response(JSON.stringify({ error: 'code, type, and data required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) {
      return new Response(JSON.stringify({ error: 'Redis credentials not configured' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const res = await fetch(env.UPSTASH_REDIS_REST_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(['SET', `flash:${code}:${type}`, JSON.stringify(data), 'EX', ttl]),
    });
    const result: any = await res.json();
    return new Response(JSON.stringify({ success: true, result: result.result }), {
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

  if (!code) {
    return new Response(JSON.stringify({ success: false }), { status: 400 });
  }

  if (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) {
    try {
      await fetch(env.UPSTASH_REDIS_REST_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(['DEL', `flash:${code}:offer`, `flash:${code}:answer`]),
      });
    } catch {}
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
