/**
 * Ultra-lightweight Zero-DB Local Analytics for FlashTransfer
 * Pure client-side session and local stats tracking.
 */

export interface SessionStats {
    sessionId: string;
    startedAt: number;
    filesSent: number;
    filesReceived: number;
    bytesSent: number;
    bytesReceived: number;
    transferMode: 'p2p' | 'broadcast' | 'bidirectional';
    fileTypes: Record<string, number>;
}

const SESSION_STORAGE_KEY = 'flashtransfer_session';

export function getSession(): SessionStats | null {
    if (typeof window === 'undefined') return null;
    try {
        const stored = localStorage.getItem(SESSION_STORAGE_KEY);
        return stored ? JSON.parse(stored) : null;
    } catch {
        return null;
    }
}

export function saveSession(session: SessionStats): void {
    if (typeof window === 'undefined') return;
    try {
        localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    } catch {}
}

export function initSession(transferMode: SessionStats['transferMode'] = 'bidirectional'): SessionStats {
    let session = getSession();
    if (!session) {
        session = {
            sessionId: `sess_${Math.random().toString(36).substring(2, 9)}`,
            startedAt: Date.now(),
            filesSent: 0,
            filesReceived: 0,
            bytesSent: 0,
            bytesReceived: 0,
            transferMode,
            fileTypes: {},
        };
        saveSession(session);
    }
    return session;
}

export function trackFileTransfer(
    fileName: string,
    fileSize: number,
    mimeType: string,
    direction: 'sent' | 'received'
): void {
    const session = getSession() || initSession();
    const ext = fileName.split('.').pop()?.toLowerCase() || 'unknown';

    if (direction === 'sent') {
        session.filesSent += 1;
        session.bytesSent += fileSize;
    } else {
        session.filesReceived += 1;
        session.bytesReceived += fileSize;
    }

    session.fileTypes[ext] = (session.fileTypes[ext] || 0) + 1;
    saveSession(session);
}

export function formatBytes(bytes: number, decimals = 1): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}
