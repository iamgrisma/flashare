import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/analytics/stats
 * Fetch aggregate transfer statistics
 */
export async function GET() {
    try {
        const supabase = createClient();
        const today = new Date().toISOString().split('T')[0];

        const { data, error } = await supabase
            .from('transfer_stats')
            .select('*')
            .eq('date', today)
            .single();

        if (error && error.code !== 'PGRST116') {
            console.error('Database error:', error);
            return NextResponse.json(
                { error: 'Failed to fetch statistics' },
                { status: 500 }
            );
        }

        if (!data) {
            return NextResponse.json({
                totalFilesTransferred: 0,
                totalBytesTransferred: 0,
                fileTypes: {},
                transferModes: {},
            });
        }

        return NextResponse.json({
            totalFilesTransferred: data.total_files_transferred,
            totalBytesTransferred: data.total_bytes_transferred,
            fileTypes: data.file_types,
            transferModes: data.transfer_modes,
        });
    } catch (error) {
        console.error('Error fetching analytics:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
