import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { reverseObfuscateCode } from '@/lib/code';

// Rate limiting
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

function checkRateLimit(ip: string, maxRequests: number = 30, windowMs: number = 60000): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(ip);

  if (!record || now > record.resetTime) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + windowMs });
    return true;
  }

  if (record.count >= maxRequests) {
    return false;
  }

  record.count++;
  return true;
}

/**
 * POST /api/share
 * Public endpoint to retrieve connection offer by code.
 * Rate limited to prevent abuse.
 */
export async function POST(request: Request) {
  try {
    // Rate limiting
    const forwarded = request.headers.get('x-forwarded-for');
    const ip = forwarded ? forwarded.split(',')[0] : 'unknown';

    if (!checkRateLimit(ip, 30, 60000)) {
      return NextResponse.json(
        { message: 'Too many requests' },
        { status: 429 }
      );
    }

    const { obfuscatedCode } = await request.json();

    if (!obfuscatedCode || typeof obfuscatedCode !== 'string' || obfuscatedCode.length !== 5) {
      return NextResponse.json(
        { message: 'Invalid share code' },
        { status: 400 }
      );
    }

    const supabase = createClient();
    const shortCode = reverseObfuscateCode(obfuscatedCode);

    const { data, error } = await supabase
      .from('fileshare')
      .select('id, p2p_offer, expires_at')
      .eq('short_code', shortCode)
      .single();

    if (error || !data) {
      return NextResponse.json(
        { message: 'Share code not found' },
        { status: 404 }
      );
    }

    if (data.expires_at && new Date(data.expires_at) < new Date()) {
      return NextResponse.json(
        { message: 'Share link expired' },
        { status: 410 }
      );
    }

    return NextResponse.json({ p2pOffer: data.p2p_offer, shareId: data.id });
  } catch (e: any) {
    console.error('API Error:', e);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}
