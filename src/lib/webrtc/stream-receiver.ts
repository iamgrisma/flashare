/**
 * Direct file download and disk streamer
 * Supports Direct-to-Disk streaming via showSaveFilePicker (File System Access API)
 * with graceful fallback to Blob/URL download for Safari, Firefox, and mobile browsers.
 */

export interface IncomingFileSession {
  fileId: string;
  name: string;
  size: number;
  mimeType: string;
  totalChunks: number;
  receivedBytes: number;
  receivedChunks: Map<number, Uint8Array>;
  writableStream?: FileSystemWritableFileStream | null;
  isDirectToDisk: boolean;
  status: 'pending' | 'downloading' | 'completed' | 'error';
}

export class FileStreamReceiver {
  private sessions: Map<string, IncomingFileSession> = new Map();

  public startSession(file: {
    fileId: string;
    name: string;
    size: number;
    mimeType: string;
    totalChunks: number;
  }): IncomingFileSession {
    const session: IncomingFileSession = {
      ...file,
      receivedBytes: 0,
      receivedChunks: new Map(),
      isDirectToDisk: false,
      status: 'downloading',
    };
    this.sessions.set(file.fileId, session);
    return session;
  }

  public getSession(fileId: string): IncomingFileSession | undefined {
    return this.sessions.get(fileId);
  }

  /**
   * Enables File System Access API streaming directly to disk.
   * Eliminates browser RAM allocation for arbitrarily large files (e.g. 5GB - 20GB).
   */
  public async enableDirectToDisk(fileId: string): Promise<boolean> {
    const session = this.sessions.get(fileId);
    if (!session) return false;

    if (typeof window !== 'undefined' && 'showSaveFilePicker' in window) {
      try {
        const handle = await (window as any).showSaveFilePicker({
          suggestedName: session.name,
        });
        session.writableStream = await handle.createWritable();
        session.isDirectToDisk = true;
        return true;
      } catch (err) {
        console.warn('Direct to disk picker dismissed or not granted:', err);
        return false;
      }
    }
    return false;
  }

  public async appendChunk(
    fileId: string,
    chunkIndex: number,
    data: Uint8Array
  ): Promise<{ receivedBytes: number; totalBytes: number; isComplete: boolean }> {
    const session = this.sessions.get(fileId);
    if (!session) {
      throw new Error(`Session ${fileId} not found`);
    }

    if (session.writableStream) {
      try {
        await (session.writableStream as any).write(data);
        session.receivedBytes += data.byteLength;
      } catch (err) {
        console.warn('Direct stream write failed, falling back to memory buffer:', err);
        session.writableStream = null;
        session.isDirectToDisk = false;
        session.receivedChunks.set(chunkIndex, data);
        session.receivedBytes += data.byteLength;
      }
    } else {
      session.receivedChunks.set(chunkIndex, data);
      session.receivedBytes += data.byteLength;
    }

    const isComplete = session.receivedBytes >= session.size;
    if (isComplete) {
      session.status = 'completed';
    }

    return {
      receivedBytes: session.receivedBytes,
      totalBytes: session.size,
      isComplete,
    };
  }

  /**
   * Finalize and trigger the download/save.
   */
  public async finalizeFile(fileId: string): Promise<void> {
    const session = this.sessions.get(fileId);
    if (!session) return;

    if (session.writableStream) {
      try {
        await session.writableStream.close();
        session.writableStream = null;
        return;
      } catch (err) {
        console.error('Failed to close writable stream:', err);
      }
    }

    // Assemble stored chunks in index order
    const orderedChunks: Uint8Array[] = [];
    for (let i = 0; i < session.totalChunks; i++) {
      const chunk = session.receivedChunks.get(i);
      if (chunk) {
        orderedChunks.push(chunk);
      }
    }

    const blob = new Blob(orderedChunks as any[], { type: session.mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = session.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 10000);

    // Free memory immediately
    session.receivedChunks.clear();
  }

  public cancel(fileId: string) {
    const session = this.sessions.get(fileId);
    if (session) {
      if (session.writableStream) {
        try {
          session.writableStream.abort();
        } catch {}
      }
      session.receivedChunks.clear();
      this.sessions.delete(fileId);
    }
  }

  public clearAll() {
    for (const [id] of this.sessions) {
      this.cancel(id);
    }
    this.sessions.clear();
  }
}
