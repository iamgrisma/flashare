'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { FileDetails, ScannedFile } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Download, File as FileIcon, Loader, ShieldAlert, Wifi, WifiOff, Check, Zap } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { reverseObfuscateCode } from '@/lib/code';
import { NativeP2PEngine } from '@/lib/webrtc/native-peer';
import { FileStreamReceiver } from '@/lib/webrtc/stream-receiver';
import { ControlMessage } from '@/lib/webrtc/config';
import { formatBytes, formatSpeed } from '@/lib/analytics';

type TransferStatus = 'Connecting' | 'Waiting' | 'Receiving' | 'Completed' | 'Error';

export default function DownloadPage() {
  const params = useParams();
  const obfuscatedCode = params.code as string;

  const [files, setFiles] = useState<ScannedFile[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [status, setStatus] = useState<TransferStatus>('Connecting');
  const [senderOnline, setSenderOnline] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<{ [key: string]: number }>({});
  const [downloadSpeed, setDownloadSpeed] = useState<{ [key: string]: number }>({});

  const engineRef = useRef<NativeP2PEngine | null>(null);
  const receiverRef = useRef<FileStreamReceiver>(new FileStreamReceiver());
  const speedTrackerRef = useRef<{
    [fileName: string]: {
      lastBytes: number;
      lastTime: number;
      speed: number;
    };
  }>({});
  const { toast } = useToast();
  const filesToDownloadRef = useRef<string[]>([]);

  const requestNextFile = useCallback(() => {
    if (!engineRef.current || !engineRef.current.isConnected) return;
    const nextFile = filesToDownloadRef.current[0];
    if (nextFile) {
      setStatus('Receiving');
      engineRef.current.sendControl({
        type: 'request-file',
        payload: { fileId: nextFile },
      });
    } else {
      setStatus('Completed');
    }
  }, []);

  const handleControlMessage = useCallback(
    (msg: ControlMessage) => {
      switch (msg.type) {
        case 'file-metadata': {
          const newFiles: ScannedFile[] = msg.payload.map(f => ({
            id: f.id,
            name: f.name,
            size: f.size,
            type: f.mimeType,
            scanStatus: 'scanned' as const,
          }));
          setFiles(newFiles);
          setStatus('Waiting');
          break;
        }

        case 'transfer-start': {
          receiverRef.current.startSession(msg.payload);
          setDownloadProgress(prev => ({ ...prev, [msg.payload.name]: 0 }));
          setStatus('Receiving');
          break;
        }

        case 'transfer-complete': {
          const session = receiverRef.current.getSession(msg.payload.fileId);
          if (session) {
            receiverRef.current.finalizeFile(msg.payload.fileId);
            setDownloadProgress(prev => ({ ...prev, [msg.payload.name]: 100 }));
            setDownloadSpeed(prev => ({ ...prev, [msg.payload.name]: 0 }));
            delete speedTrackerRef.current[msg.payload.name];
            toast({
              title: 'Download Complete',
              description: `${msg.payload.name} saved to disk.`,
            });
            filesToDownloadRef.current.shift();
            requestNextFile();
          }
          break;
        }

        case 'transfer-cancel': {
          receiverRef.current.cancel(msg.payload.fileId);
          setDownloadSpeed(prev => ({ ...prev, [msg.payload.fileId]: 0 }));
          delete speedTrackerRef.current[msg.payload.fileId];
          toast({ title: 'Transfer Cancelled', description: 'Sender stopped the transfer', variant: 'destructive' });
          filesToDownloadRef.current.shift();
          requestNextFile();
          break;
        }
      }
    },
    [requestNextFile, toast]
  );

  const handleBinaryData = useCallback(async (data: ArrayBuffer) => {
    if (data.byteLength < 24) return;
    const view = new DataView(data);
    const magic = view.getUint32(0);
    if (magic !== 0x50325031) return; // 'P2P1'

    const idBytes = new Uint8Array(data, 4, 16);
    const rawId = new TextDecoder().decode(idBytes).trim();
    const chunkIndex = view.getUint32(20);
    const payload = new Uint8Array(data, 24);

    const res = await receiverRef.current.appendChunk(rawId, chunkIndex, payload);
    const session = receiverRef.current.getSession(rawId);
    if (session) {
      const pct = Math.min((res.receivedBytes / res.totalBytes) * 100, 100);
      setDownloadProgress(prev => ({ ...prev, [session.name]: pct }));

      // Calculate real-time speed
      const now = performance.now();
      let tracker = speedTrackerRef.current[session.name];
      if (!tracker) {
        speedTrackerRef.current[session.name] = {
          lastBytes: res.receivedBytes,
          lastTime: now,
          speed: 0,
        };
      } else {
        const timeDelta = (now - tracker.lastTime) / 1000;
        if (timeDelta >= 0.2) { // sample every 200ms
          const bytesDelta = res.receivedBytes - tracker.lastBytes;
          const instantSpeed = bytesDelta / Math.max(timeDelta, 0.001);
          const smoothedSpeed = tracker.speed > 0
            ? 0.7 * tracker.speed + 0.3 * instantSpeed
            : instantSpeed;

          tracker.speed = smoothedSpeed;
          tracker.lastBytes = res.receivedBytes;
          tracker.lastTime = now;

          setDownloadSpeed(prev => ({ ...prev, [session.name]: smoothedSpeed }));
        }
      }
    }
  }, []);

  const initializeConnection = useCallback(async (code: string) => {
    try {
      const shortCode = reverseObfuscateCode(code);

      // Fetch offer from exchange API
      const res = await fetch('/api/signaling/exchange', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get', shortCode }),
      });
      const data = await res.json();

      if (!data.success || !data.session?.offer) {
        throw new Error('Connection expired or code not found.');
      }

      const session = data.session;
      const engine = new NativeP2PEngine();
      engineRef.current = engine;
      const pc = engine.init(false);

      engine.setCallbacks({
        onControl: handleControlMessage,
        onData: handleBinaryData,
        onState: (state) => {
          if (state === 'connected') {
            setSenderOnline(true);
            setStatus('Waiting');
            toast({ title: 'Connected!', description: 'WebRTC P2P direct data channel ready' });
            // Immediately request file list from sender
            engine.sendControl({ type: 'request-file-list' });
            setTimeout(() => {
              engine.sendControl({ type: 'request-file-list' });
            }, 600);
          } else if (state === 'disconnected' || state === 'failed') {
            setSenderOnline(false);
            setError('Connection to sender was lost.');
            setStatus('Error');
          }
        },
        onTrickleCandidate: (cand) => {
          fetch('/api/signaling/exchange', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'add-candidate', id: session.id, candidate: cand.toJSON(), fromHost: false }),
          }).catch(() => {});
        },
      });

      await pc.setRemoteDescription(new RTCSessionDescription(session.offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      // Apply initial host ICE candidates
      const processedCandidates = new Set<string>();
      if (session.hostCandidates && Array.isArray(session.hostCandidates)) {
        for (const cand of session.hostCandidates) {
          const key = JSON.stringify(cand);
          processedCandidates.add(key);
          try {
            await pc.addIceCandidate(new RTCIceCandidate(cand));
          } catch {}
        }
      }

      // Post answer back
      await fetch('/api/signaling/exchange', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'answer', id: session.id, sdp: answer }),
      });

      // Poll for additional host trickle candidates
      const pollTimer = setInterval(async () => {
        if (!engine.pc || engine.isConnected) {
          clearInterval(pollTimer);
          return;
        }
        try {
          const pollRes = await fetch('/api/signaling/exchange', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'get', id: session.id }),
          });
          const pollData = await pollRes.json();
          if (pollData.success && pollData.session?.hostCandidates) {
            for (const cand of pollData.session.hostCandidates) {
              const key = JSON.stringify(cand);
              if (!processedCandidates.has(key)) {
                processedCandidates.add(key);
                try {
                  await pc.addIceCandidate(new RTCIceCandidate(cand));
                } catch {}
              }
            }
          }
        } catch {}
      }, 500);
    } catch (err: any) {
      console.error('Download init error:', err);
      setError(err.message || 'Failed to connect to sender.');
      setStatus('Error');
    }
  }, [handleControlMessage, handleBinaryData, toast]);

  useEffect(() => {
    if (obfuscatedCode) {
      initializeConnection(obfuscatedCode);
    }
    return () => {
      if (engineRef.current) {
        engineRef.current.close();
      }
    };
  }, [obfuscatedCode, initializeConnection]);

  const requestDownload = (fileName: string) => {
    if (!filesToDownloadRef.current.includes(fileName)) {
      filesToDownloadRef.current.push(fileName);
    }
    if (status !== 'Receiving') {
      requestNextFile();
    }
  };

  const downloadSelected = () => {
    selectedFiles.forEach(f => {
      if (!filesToDownloadRef.current.includes(f)) {
        filesToDownloadRef.current.push(f);
      }
    });
    if (status !== 'Receiving') {
      requestNextFile();
    }
  };

  return (
    <div className="container mx-auto p-4 sm:p-6 max-w-2xl min-h-screen flex flex-col justify-center">
      <Card className="shadow-lg">
        <CardHeader className="space-y-1">
          <div className="flex justify-between items-center">
            <CardTitle className="text-2xl font-bold">Download Files</CardTitle>
            <Badge variant={senderOnline ? 'default' : 'secondary'} className="flex items-center gap-1.5">
              {senderOnline ? <Wifi className="w-3.5 h-3.5 text-green-400" /> : <WifiOff className="w-3.5 h-3.5" />}
              {senderOnline ? 'Connected' : 'Connecting'}
            </Badge>
          </div>
          <CardDescription>
            Receiving files directly from sender via end-to-end encrypted WebRTC
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <ShieldAlert className="h-4 w-4" />
              <AlertTitle>Connection Notice</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {status === 'Connecting' && !error && (
            <div className="text-center py-8 space-y-3">
              <Loader className="h-8 w-8 animate-spin mx-auto text-primary" />
              <p className="text-sm text-muted-foreground">Establishing direct peer-to-peer connection...</p>
            </div>
          )}

          {files.length > 0 && (
            <div className="space-y-3">
              <div className="flex justify-between items-center text-sm font-medium">
                <span>Shared Files ({files.length})</span>
                {selectedFiles.length > 0 && (
                  <Button size="sm" onClick={downloadSelected}>
                    Download Selected ({selectedFiles.length})
                  </Button>
                )}
              </div>

              <div className="space-y-2">
                {files.map(file => {
                  const progress = downloadProgress[file.name] || 0;
                  const isDone = progress >= 100;
                  const isReceiving = progress > 0 && progress < 100;

                  return (
                    <div key={file.name} className="p-3 border rounded-lg bg-card space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 truncate">
                          <Checkbox
                            checked={selectedFiles.includes(file.name)}
                            onCheckedChange={checked => {
                              if (checked) {
                                setSelectedFiles(prev => [...prev, file.name]);
                              } else {
                                setSelectedFiles(prev => prev.filter(n => n !== file.name));
                              }
                            }}
                          />
                          <FileIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                          <span className="text-sm font-medium truncate">{file.name}</span>
                        </div>
                        <span className="text-xs text-muted-foreground font-mono shrink-0">
                          {formatBytes(file.size)}
                        </span>
                      </div>

                      {progress > 0 && (
                        <div className="space-y-1.5 pt-1">
                          <div className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2">
                              <span className="text-muted-foreground font-medium text-[11px]">
                                {isDone ? 'Saved' : 'Streaming...'}
                              </span>
                              {isReceiving && (downloadSpeed[file.name] || 0) > 0 && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-mono text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                  <Zap className="h-2.5 w-2.5 shrink-0 fill-current" />
                                  {formatSpeed(downloadSpeed[file.name])}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5">
                              {isReceiving && (downloadSpeed[file.name] || 0) > 0 && (
                                <span className="text-[10px] font-mono text-muted-foreground">
                                  ({formatSpeed(downloadSpeed[file.name])})
                                </span>
                              )}
                              <span className="font-mono text-xs font-semibold text-foreground">
                                {Math.round(progress)}%
                              </span>
                            </div>
                          </div>
                          <Progress value={progress} className="h-2" />
                        </div>
                      )}

                      <div className="flex justify-end pt-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          disabled={isReceiving || isDone}
                          onClick={() => requestDownload(file.name)}
                        >
                          {isDone ? (
                            <>
                              <Check className="h-3 w-3 mr-1 text-green-500" />
                              Downloaded
                            </>
                          ) : isReceiving ? (
                            <>
                              <Loader className="h-3 w-3 mr-1 animate-spin" />
                              Receiving...
                            </>
                          ) : (
                            <>
                              <Download className="h-3 w-3 mr-1" />
                              Download
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
