
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
    try {
        const supabase = createClient();

        const { id, p2p_offer } = await request.json();

        if (!id || !p2p_offer) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // Extend expiry by 24h (for reconnection attempts)
        const newExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

        const { error } = await supabase
            .from('fileshare')
            .update({
                p2p_offer: JSON.stringify(p2p_offer),
                expires_at: newExpiry
                // Note: reusable_until is NOT updated here - it's set once on first join
            })
            .eq('id', id);

        if (error) {
            console.error('Signaling update error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('Signaling Handler Error:', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}
