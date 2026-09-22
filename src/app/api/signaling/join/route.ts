import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * POST /api/signaling/join
 * Validates device ID and locks connection on first join
 */
export async function POST(request: Request) {
    try {
        const supabase = createClient();
        const { shareId, deviceId } = await request.json();

        if (!shareId || !deviceId) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // Fetch connection details
        const { data: conn, error: fetchError } = await supabase
            .from('fileshare')
            .select('id, joiner_device_id, initiator_device_id, reusable_until')
            .eq('id', shareId)
            .single();

        if (fetchError || !conn) {
            return NextResponse.json({ error: 'Connection not found' }, { status: 404 });
        }

        // Check expiry
        if (conn.reusable_until && new Date(conn.reusable_until) < new Date()) {
            return NextResponse.json({ error: 'Connection expired' }, { status: 410 });
        }

        // Check if this is a reconnection attempt
        if (conn.joiner_device_id) {
            // Connection already locked - verify device ID
            if (conn.joiner_device_id !== deviceId && conn.initiator_device_id !== deviceId) {
                return NextResponse.json({
                    error: 'This connection is locked to different browsers',
                    locked: true
                }, { status: 403 });
            }
            // Device matches - allow reconnection
            return NextResponse.json({ success: true, locked: false });
        }

        // First time join - lock the connection
        const lockedAt = new Date().toISOString();
        const reusableUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

        const { error: updateError } = await supabase
            .from('fileshare')
            .update({
                joiner_device_id: deviceId,
                locked_at: lockedAt,
                reusable_until: reusableUntil
            })
            .eq('id', shareId);

        if (updateError) {
            console.error('Lock update error:', updateError);
            return NextResponse.json({ error: 'Failed to lock connection' }, { status: 500 });
        }

        return NextResponse.json({ success: true, locked: true, firstJoin: true });

    } catch (error: any) {
        console.error('Join validation error:', error);
        return NextResponse.json({ error: error.message || 'Internal error' }, { status: 500 });
    }
}
