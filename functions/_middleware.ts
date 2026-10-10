// Cloudflare Pages edge middleware for Flashare / FlashTransfer
interface Env {}

const BLOCKED_BOT_REGEX = /ShapBot|Bytespider|CCBot|GPTBot|ClaudeBot|DataForSeoBot|Scrapy|MJ12bot|DotBot|PetalBot|Amazonbot|SERankingBacklinksBot|AhrefsBot|AhrefsSiteAudit|SemrushBot|Baiduspider|YandexBot|SeekportBot|BLEXBot|ZoominfoBot|CriteoBot|MegaIndex/i;

export const onRequest: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const hostname = url.hostname.toLowerCase();
  const userAgent = context.request.headers.get('user-agent') || '';

  // Identify non-production preview / staging domains
  const isPreview =
    hostname.endsWith('.pages.dev') ||
    hostname.endsWith('.workers.dev') ||
    hostname.endsWith('.vercel.app') ||
    hostname.endsWith('.netlify.app') ||
    hostname === 'localhost' ||
    hostname === '127.0.0.1';

  // 0. Instant bot shield (0ms)
  if (BLOCKED_BOT_REGEX.test(userAgent)) {
    return new Response('Access Denied: Automated scraping prohibited.', {
      status: 403,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    });
  }

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
