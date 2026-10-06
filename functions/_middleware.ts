// Cloudflare Pages edge middleware for Flashare / FlashTransfer
interface Env {}

export const onRequest: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const hostname = url.hostname.toLowerCase();

  // Identify non-production preview / staging domains
  const isPreview =
    hostname.endsWith('.pages.dev') ||
    hostname.endsWith('.workers.dev') ||
    hostname.endsWith('.vercel.app') ||
    hostname.endsWith('.netlify.app') ||
    hostname === 'localhost' ||
    hostname === '127.0.0.1';

  // 1. Dynamic robots.txt disallow for non-production domains
  if (isPreview && url.pathname === '/robots.txt') {
    return new Response('User-agent: *\nDisallow: /\n', {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Robots-Tag': 'noindex, nofollow, noarchive, nosnippet',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  }

  // 2. Process downstream response
  const response = await context.next();

  // 3. Attach strict noindex headers on non-production hosts
  if (isPreview) {
    const newHeaders = new Headers(response.headers);
    newHeaders.set('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet');
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    });
  }

  return response;
};
