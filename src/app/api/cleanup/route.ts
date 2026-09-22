import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * POST /api/cleanup
 * Deletes expired connections from database
 * Can be called manually or via cron job
 */
export async function POST(request: Request) {
    try {
        const supabase = createClient();
        const now = new Date().toISOString();

        // Delete connections where reusable_until has passed
        const { data, error } = await supabase
            .from('fileshare')
            .delete()
            .lt('reusable_until', now)
            .select('id');

        if (error) {
            console.error('Cleanup error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        const deletedCount = data?.length || 0;
        console.log(`Cleaned up ${deletedCount} expired connections`);

        return NextResponse.json({
            success: true,
            deletedCount,
            message: `Deleted ${deletedCount} expired connection(s)`
        });

    } catch (error: any) {
        console.error('Cleanup handler error:', error);
        return NextResponse.json({ error: error.message || 'Internal error' }, { status: 500 });
    }
}

// Allow GET for cron jobs
export async function GET() {
    return POST(new Request('http://localhost'));
}
