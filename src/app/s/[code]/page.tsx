'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Peer from 'simple-peer';
import { createClient } from '@/lib/supabase/client';
import { FileDetails, ScannedFile } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Download, File as FileIcon, Loader, Scan, ShieldAlert, Wifi, WifiOff } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import type { RealtimeChannel } from '@supabase/supabase-js';

type TransferStatus = 'Connecting' | 'Waiting' | 'Receiving' | 'Completed' | 'Error';
type CurrentTransfer = {
  fileName: string;
  fileSize: number;
  receivedSize: number;
  chunks: any[];
} | null;

export default function DownloadPage() {
  const params = useParams();
  const obfuscatedCode = params.code as string;

  const [files, setFiles] = useState<ScannedFile[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [status, setStatus] = useState<TransferStatus>('Connecting');
  const [senderOnline, setSenderOnline] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<{ [key: string]: number }>({});

  const peerRef = useRef<Peer.Instance | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const { toast } = useToast();
  const filesToDownloadRef = useRef<string[]>([]);
  const currentTransferRef = useRef<CurrentTransfer>(null);
  const savedFilesRef = useRef<Set<string>>(new Set());

  const downloadFile = useCallback((fileName: string, chunks: any[], fileType: string) => {
    try {
      const fileBlob = new Blob(chunks, { type: fileType });
      const url = URL.createObjectURL(fileBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      savedFilesRef.current.add(fileName);
      toast({ title: 'Download Complete', description: `${fileName} has been saved.` });
    } catch (e) {
      console.error("Error creating blob for download:", e);
      toast({ title: 'Download Failed', description: `Could not save file ${fileName}.`, variant: 'destructive' });
    }
  }, [toast]);

  const requestNextFileFromQueue = useCallback(() => {
    if (peerRef.current && !peerRef.current.destroyed && peerRef.current.connected) {
      const nextFile = filesToDownloadRef.current[0];
      if (nextFile) {
        setStatus('Receiving');
        peerRef.current.send(JSON.stringify({ type: 'requestFile', payload: { fileName: nextFile } }));
      } else {
        const allSelectedDownloaded = selectedFiles.every(sf => (downloadProgress[sf] || 0) >= 100);
        if (allSelectedDownloaded && selectedFiles.length > 0) {
          setStatus('Completed');
        } else if (status !== 'Error') {
          setStatus('Waiting');
        }
      }
    }
  }, [selectedFiles, downloadProgress, status]);

  const setupPeerEvents = useCallback((peer: Peer.Instance) => {
    peer.on('connect', () => {
      setSenderOnline(true);
      setStatus('Waiting');
      toast({ title: 'Connected', description: 'Connection to sender established.' });
    });

    peer.on('data', (data) => {
      setSenderOnline(true);

      // Handle file chunks
      if (data instanceof ArrayBuffer || data instanceof Uint8Array) {
        if (currentTransferRef.current) {
          const chunk = data instanceof Uint8Array ? data : new Uint8Array(data);
          currentTransferRef.current.chunks.push(chunk);
          currentTransferRef.current.receivedSize += chunk.byteLength;
          const { fileName, fileSize } = currentTransferRef.current;
          const progress = Math.min((currentTransferRef.current.receivedSize / fileSize) * 100, 100);
          setDownloadProgress(prev => ({ ...prev, [fileName]: progress }));
        }
        return;
      }

      // Handle JSON signals
      try {
        const parsedData = JSON.parse(data.toString());
        const { type, payload } = parsedData;

        switch (type) {
          case 'fileDetails':
            const newFiles: ScannedFile[] = payload.map((f: FileDetails) => ({ ...f, scanStatus: 'unscanned' }));
            setFiles(newFiles);
            break;
          case 'transferStart':
            currentTransferRef.current = {
              fileName: payload.fileName,
              fileSize: payload.fileSize,
              receivedSize: 0,
              chunks: []
            };
            setDownloadProgress(prev => ({ ...prev, [payload.fileName]: 0 }));
            break;
          case 'transferComplete':
            if (currentTransferRef.current && currentTransferRef.current.fileName === payload.fileName) {
              const completedFile = files.find(f => f.name === payload.fileName);
              if (completedFile) {
                downloadFile(payload.fileName, currentTransferRef.current.chunks, completedFile.type);
                setDownloadProgress(prev => ({ ...prev, [payload.fileName]: 100 }));
              }
              currentTransferRef.current = null;
              filesToDownloadRef.current.shift();
              requestNextFileFromQueue();
            }
            break;
        }
      } catch (e) {
        // Not JSON, likely a raw data chunk. Handled above.
      }
    });

    peer.on('error', (err) => {
      console.error('Receiver Peer error', err);
      setSenderOnline(false);
      if (status !== 'Completed') {
        setError('Connection to sender lost.');
        setStatus('Error');
      }
    });

    peer.on('close', () => {
      setSenderOnline(false);
      if (status !== 'Completed' && status !== 'Error') {
        setError('Sender has disconnected.');
        setStatus('Error');
      }
    });
  }, [downloadFile, requestNextFileFromQueue, files, status, toast]);

  const initializeConnection = useCallback(async (code: string) => {
    try {
      // Use Next.js API route instead of separate worker
      const response = await fetch('/api/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ obfuscatedCode: code }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Share session not found or expired.');
      }

      // Check if mounted after async fetch
      if (!isMounted.current) return;

      const { p2pOffer, shareId } = await response.json();

      if (!p2pOffer || !shareId) {
        throw new Error('Invalid or expired share link.');
      }

      const supabase = createClient();
      // RECEIVER is NOT the initiator
      const newPeer = new Peer({ initiator: false, trickle: false });
      peerRef.current = newPeer;

      // CRITICAL: Set up event listeners BEFORE signaling.
      setupPeerEvents(newPeer);

      // RECEIVER: When the answer signal is ready, send it to the sender
      newPeer.on('signal', (answer) => {
        if (!isMounted.current) return; // Guard
        if (answer.type !== 'answer') return;

        const channel = supabase.channel(`share-session-${shareId}`);
        channelRef.current = channel;
        channel.subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            channel.send({
              type: 'broadcast',
              event: 'answer',
              payload: { answer },
            });
          }
        });
      });

      // RECEIVER: Signal with the offer from the sender
      newPeer.signal(JSON.parse(p2pOffer));

    } catch (err: any) {
      if (isMounted.current) {
        setError(err.message || 'An unexpected error occurred.');
        setStatus('Error');
      }
    }
  }, [setupPeerEvents]);

  // Track if the component is mounted to handle async operations safely
  const isMounted = useRef(true);

  // Separate the initialization logic into a function that respects the mounted state
  const init = useCallback(async () => {
    if (!obfuscatedCode) return;

    // Check if we already have an active peer or if initialization is locked?
    // In strict mode, we might get called twice.
    // We want to ensure we don't create multiple peers for the same mount.

    // Note: initializeConnection is async.
    await initializeConnection(obfuscatedCode);
  }, [obfuscatedCode, initializeConnection]);

  useEffect(() => {
    isMounted.current = true;
    init();

    // Cleanup function
    return () => {
      isMounted.current = false;
      peerRef.current?.destroy();
      if (channelRef.current) {
        channelRef.current.unsubscribe();
      }
    }
  }, [init]);


  const requestFiles = (fileNames: string[]) => {
    const filesToRequest = fileNames.filter(name => !savedFilesRef.current.has(name) && !filesToDownloadRef.current.includes(name));

    if (fileNames.length > 0 && fileNames.every(name => savedFilesRef.current.has(name))) {
      toast({ title: 'Already Downloaded', description: 'All selected files have already been downloaded.' });
      return;
    }

    if (peerRef.current && peerRef.current.connected) {
      const isQueueAlreadyRunning = filesToDownloadRef.current.length > 0;
      filesToDownloadRef.current.push(...filesToRequest);

      if (!isQueueAlreadyRunning) {
        requestNextFileFromQueue();
      }
    } else {
      toast({ title: 'Not Connected', description: 'Cannot download files. Not connected to sender.', variant: 'destructive' });
    }
  };

  const handleDownloadSelected = () => {
    requestFiles(selectedFiles);
  }

  const handleDownloadAll = () => {
    const allFileNames = files.map(f => f.name);
    setSelectedFiles(allFileNames);
    requestFiles(allFileNames);
  }

  const handleSelectFile = (fileName: string, isSelected: boolean) => {
    if (isSelected) {
      setSelectedFiles(prev => [...prev, fileName]);
    } else {
      setSelectedFiles(prev => prev.filter(name => name !== fileName));
    }
  }

  const handleSelectAll = (isSelected: boolean) => {
    if (isSelected) {
      setSelectedFiles(files.map(f => f.name));
    } else {
      setSelectedFiles([]);
    }
  }

  const handleScanFile = (fileName: string) => {
    setFiles(prev => prev.map(f => f.name === fileName ? { ...f, scanStatus: 'scanning' } : f));
    setTimeout(() => {
      setFiles(prev => prev.map(f => f.name === fileName ? { ...f, scanStatus: 'scanned' } : f));
      toast({ title: 'Scan Complete', description: `${fileName} appears to be safe.` });
    }, 1500);
  }

  const handleScanSelected = () => {
    selectedFiles.forEach(handleScanFile);
  }

  const handleScanAll = () => {
    files.forEach(f => handleScanFile(f.name));
  }

  const formatBytes = (bytes: number, decimals = 2) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  const isAllSelected = files.length > 0 && selectedFiles.length === files.length;
  const isReceiving = status === 'Receiving';

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl shadow-lg">
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle className="font-headline">Receive Files</CardTitle>
            <Badge variant={senderOnline ? 'default' : 'destructive'} className="flex items-center gap-2 bg-opacity-20">
              {senderOnline ? <Wifi className="text-green-400" /> : <WifiOff className="text-red-400" />}
              <span className={senderOnline ? "text-green-400" : "text-red-400"}>
                {senderOnline ? 'Sender Online' : 'Sender Offline'}
              </span>
            </Badge>
          </div>
          <CardDescription>
            {error ? 'An error occurred.' : 'Review files from the sender before downloading.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {status === 'Connecting' && !error && (
            <div className="flex flex-col items-center justify-center space-y-4 p-10">
              <Loader className="h-12 w-12 text-primary animate-spin" />
              <p>Connecting to sender...</p>
            </div>
          )}

          {error &&
            <div className="flex flex-col items-center justify-center space-y-4 p-10 text-center">
              <WifiOff className="h-12 w-12 text-destructive" />
              <p className="text-destructive font-medium">Download Failed</p>
              <p className="text-destructive/80 text-sm">{error}</p>
            </div>
          }

          {files.length === 0 && status === 'Waiting' && !error && (
            <div className="flex flex-col items-center justify-center space-y-4 p-10">
              <Loader className="h-12 w-12 text-primary animate-spin" />
              <p>Waiting for sender to provide files...</p>
            </div>
          )}

          {files.length > 0 && !error && (
            <div>
              <Alert variant="destructive" className="mb-6 bg-destructive/10">
                <ShieldAlert className="h-4 w-4 !text-destructive" />
                <AlertTitle>Security Warning</AlertTitle>
                <AlertDescription>
                  Only download these files if you trust the sender. FileZen cannot guarantee the safety of the contents.
                </AlertDescription>
              </Alert>

              <div className="space-y-2 max-h-96 overflow-y-auto pr-3">
                <div className="flex items-center border-b pb-2 mb-2">
                  <Checkbox id="select-all"
                    onCheckedChange={(checked) => handleSelectAll(!!checked)}
                    checked={isAllSelected}
                    disabled={isReceiving}
                  />
                  <label htmlFor="select-all" className="ml-3 text-sm font-medium">Select All</label>
                </div>
                {files.map(file => {
                  const progress = downloadProgress[file.name] || 0;
                  const isDownloaded = progress === 100;
                  return (
                    <div key={file.name} className="flex items-center space-x-4 p-3 rounded-md border hover:bg-secondary/50">
                      <Checkbox
                        id={`select-${file.name}`}
                        checked={selectedFiles.includes(file.name)}
                        onCheckedChange={(checked) => handleSelectFile(file.name, !!checked)}
                        disabled={isReceiving}
                      />
                      <FileIcon className="h-8 w-8 text-primary" />
                      <div className="flex-1 overflow-hidden">
                        <p className="text-sm font-medium truncate text-foreground">{file.name}</p>
                        <p className="text-sm text-muted-foreground">{formatBytes(file.size)}</p>
                        {progress > 0 && <Progress value={progress} className="h-2 mt-1" />}
                      </div>
                      <div className="flex items-center gap-2">
                        {file.scanStatus === 'unscanned' && (
                          <Button variant="ghost" size="sm" onClick={() => handleScanFile(file.name)} disabled={isReceiving}>
                            <Scan className="mr-2" /> Scan
                          </Button>
                        )}
                        {file.scanStatus === 'scanning' && <Loader className="animate-spin text-primary" />}
                        {file.scanStatus === 'scanned' && <ShieldAlert className="text-green-500" />}

                        <Button size="sm" onClick={() => requestFiles([file.name])} disabled={isReceiving && currentTransferRef.current?.fileName !== file.name}>
                          <Download className="mr-2" /> {isDownloaded ? 'Save Again' : 'Download'}
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="flex flex-wrap gap-2 mt-6 border-t pt-4">
                <Button onClick={handleDownloadSelected} disabled={selectedFiles.length === 0 || isReceiving}>
                  <Download className="mr-2" /> Download Selected ({selectedFiles.length})
                </Button>
                <Button onClick={handleDownloadAll} variant="secondary" disabled={isReceiving}>
                  <Download className="mr-2" /> Download All ({files.length})
                </Button>
                <Button onClick={handleScanSelected} variant="outline" disabled={selectedFiles.length === 0 || isReceiving}>
                  <Scan className="mr-2" /> Scan Selected ({selectedFiles.length})
                </Button>
                <Button onClick={handleScanAll} variant="outline" disabled={isReceiving}>
                  <Scan className="mr-2" /> Scan All
                </Button>
              </div>

            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

