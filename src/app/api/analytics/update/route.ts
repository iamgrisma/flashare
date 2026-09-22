import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { verifyToken } from '@/lib/auth';

// Rate limiting
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

function checkRateLimit(ip: string, maxRequests: number = 10, windowMs: number = 60000): boolean {
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
 * POST /api/analytics/update
 * Requires: X-Auth-Token and X-Timestamp headers
 */
export async function POST(request: Request) {
    try {
        // Verify authentication token
        const authToken = request.headers.get('x-auth-token');
        const timestampHeader = request.headers.get('x-timestamp');

        if (!authToken || !timestampHeader) {
            return NextResponse.json(
                { error: 'Unauthorized - Missing authentication' },
                { status: 401 }
            );
        }

        const timestamp = parseInt(timestampHeader, 10);
        const isValid = await verifyToken(authToken, timestamp);
        if (!isValid) {
            return NextResponse.json(
                { error: 'Unauthorized - Invalid or expired token' },
                { status: 401 }
            );
        }

        // Rate limiting
        const forwarded = request.headers.get('x-forwarded-for');
        const ip = forwarded ? forwarded.split(',')[0] : 'unknown';

        if (!checkRateLimit(ip, 10, 60000)) {
            return NextResponse.json(
                { error: 'Rate limit exceeded' },
                { status: 429 }
            );
        }

        const { filesTransferred, bytesTransferred, fileTypes, transferMode } = await request.json();

        // Validate input
        if (
            typeof filesTransferred !== 'number' ||
            typeof bytesTransferred !== 'number' ||
            typeof fileTypes !== 'object' ||
            typeof transferMode !== 'string' ||
            filesTransferred < 0 || filesTransferred > 1000 ||
            bytesTransferred < 0 || bytesTransferred > 10 * 1024 * 1024 * 1024 ||
            !['p2p', 'broadcast', 'bidirectional'].includes(transferMode)
        ) {
            return NextResponse.json(
                { error: 'Invalid input' },
                { status: 400 }
            );
        }

        const supabase = createClient();

        const { error } = await supabase.rpc('update_transfer_stats', {
            p_files_transferred: filesTransferred,
            p_bytes_transferred: bytesTransferred,
            p_file_types: fileTypes,
            p_transfer_mode: transferMode,
        });

        if (error) {
            console.error('Database error:', error);
            return NextResponse.json(
                { error: 'Failed to update statistics' },
                { status: 500 }
            );
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error updating analytics:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
