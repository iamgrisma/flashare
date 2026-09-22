import { NextResponse } from 'next/server';
import { generateToken } from '@/lib/auth';

/**
 * GET /api/auth/token
 * Returns a fresh auth token for client use
 */
export async function GET() {
    try {
        const { token, timestamp } = await generateToken();

        return NextResponse.json({
            token,
            timestamp,
            expiresIn: 120, // 2 minutes in seconds
        });
    } catch (error) {
        console.error('Error generating token:', error);
        return NextResponse.json(
            { error: 'Failed to generate token' },
            { status: 500 }
        );
    }
}
