"use client";

import { useState, useRef, useCallback, useEffect } from 'react';
import FileUpload from '@/components/file-upload';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { File as FileIcon, Upload, Download, Check, Loader, Trash2, ShieldCheck, HardDriveDownload, Zap } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { trackFileTransfer, formatBytes, formatSpeed } from '@/lib/analytics';
import type { FileDetails, ScannedFile } from '@/lib/types';
import { NativeP2PEngine } from '@/lib/webrtc/native-peer';
import { FileStreamReceiver } from '@/lib/webrtc/stream-receiver';
import { ControlMessage } from '@/lib/webrtc/config';

interface TransferPanelProps {
    peer: NativeP2PEngine;
    connectionCode: string;
    isInitiator: boolean;
    initialFiles?: File[];
}

type FileTransferProgress = {
    [fileName: string]: number;
};

export default function TransferPanel({ peer, connectionCode, isInitiator, initialFiles = [] }: TransferPanelProps) {
    const [outgoingFiles, setOutgoingFiles] = useState<File[]>(initialFiles);
    const [incomingFiles, setIncomingFiles] = useState<ScannedFile[]>([]);
    const [selectedIncoming, setSelectedIncoming] = useState<string[]>([]);
    const [sendProgress, setSendProgress] = useState<FileTransferProgress>({});
    const [receiveProgress, setReceiveProgress] = useState<FileTransferProgress>({});
    const [receiveSpeed, setReceiveSpeed] = useState<{ [fileName: string]: number }>({});
    const [sendSpeed, setSendSpeed] = useState<{ [fileName: string]: number }>({});
    const [transferSpeed, setTransferSpeed] = useState<string>('');

    const { toast } = useToast();
    const receiverRef = useRef<FileStreamReceiver>(new FileStreamReceiver());
    const receiveSpeedTrackerRef = useRef<{
        [fileName: string]: {
            lastBytes: number;
            lastTime: number;
            speed: number;
        };
    }>({});
    const isCancelledRef = useRef<boolean>(false);
    const activeSendingFileRef = useRef<string | null>(null);

    // Sync file list with peer
    const broadcastOutgoingFiles = useCallback((files: File[]) => {
        if (!peer || !peer.isConnected) return;
        const metadata = files.map(f => ({
            id: f.name,
            name: f.name,
            size: f.size,
            mimeType: f.type || 'application/octet-stream'
        }));
        peer.sendControl({
            type: 'file-metadata',
            payload: metadata
        });
    }, [peer]);

    // Handle peer control messages
    const handleControlMessage = useCallback((msg: ControlMessage) => {
        switch (msg.type) {
            case 'file-metadata': {
                const newFiles: ScannedFile[] = msg.payload.map(f => ({
                    id: f.id,
                    name: f.name,
                    size: f.size,
                    type: f.mimeType,
                    scanStatus: 'scanned' as const
                }));
                setIncomingFiles(prev => {
                    const existingNames = new Set(prev.map(p => p.name));
                    const uniqueNew = newFiles.filter(f => !existingNames.has(f.name));
                    return [...prev, ...uniqueNew];
                });
                toast({ title: 'Files Available', description: `Peer is sharing ${newFiles.length} file(s)` });
                break;
            }

            case 'transfer-start': {
                receiverRef.current.startSession(msg.payload);
                setReceiveProgress(prev => ({ ...prev, [msg.payload.name]: 0 }));
                break;
            }

            case 'transfer-complete': {
                const session = receiverRef.current.getSession(msg.payload.fileId);
                if (session) {
                    receiverRef.current.finalizeFile(msg.payload.fileId);
                    setReceiveProgress(prev => ({ ...prev, [msg.payload.name]: 100 }));
                    setReceiveSpeed(prev => ({ ...prev, [msg.payload.name]: 0 }));
                    delete receiveSpeedTrackerRef.current[msg.payload.name];
                    trackFileTransfer(msg.payload.name, msg.payload.size, 'application/octet-stream', 'received');
                    toast({
                        title: 'Transfer Complete!',
                        description: `${msg.payload.name} received and saved.`,
                    });
                }
                break;
            }

            case 'transfer-cancel': {
                receiverRef.current.cancel(msg.payload.fileId);
                setReceiveSpeed(prev => ({ ...prev, [msg.payload.fileId]: 0 }));
                delete receiveSpeedTrackerRef.current[msg.payload.fileId];
                toast({ title: 'Transfer Cancelled', description: 'Sender cancelled the transfer', variant: 'destructive' });
                break;
            }

            case 'request-file': {
                const fileToStream = outgoingFiles.find(f => f.name === msg.payload.fileId);
                if (fileToStream) {
                    executeStreamFile(fileToStream);
                }
                break;
            }
        }
    }, [outgoingFiles, toast]);

    // Handle raw incoming binary chunks
    const handleBinaryData = useCallback(async (data: ArrayBuffer) => {
        if (data.byteLength < 24) return;
        const view = new DataView(data);
        const magic = view.getUint32(0);
        if (magic !== 0x50325031) return; // 'P2P1'

        // Extract 16-char ASCII fileId
        const idBytes = new Uint8Array(data, 4, 16);
        const rawId = new TextDecoder().decode(idBytes).trim();
        const chunkIndex = view.getUint32(20);
        const payload = new Uint8Array(data, 24);

        const res = await receiverRef.current.appendChunk(rawId, chunkIndex, payload);
        const session = receiverRef.current.getSession(rawId);
        if (session) {
            const pct = Math.min((res.receivedBytes / res.totalBytes) * 100, 100);
            setReceiveProgress(prev => ({ ...prev, [session.name]: pct }));

            // Real-time speed calculation
            const now = performance.now();
            let tracker = receiveSpeedTrackerRef.current[session.name];
            if (!tracker) {
                receiveSpeedTrackerRef.current[session.name] = {
                    lastBytes: res.receivedBytes,
                    lastTime: now,
                    speed: 0,
                };
            } else {
                const timeDelta = (now - tracker.lastTime) / 1000;
                if (timeDelta >= 0.2) {
                    const bytesDelta = res.receivedBytes - tracker.lastBytes;
                    const instantSpeed = bytesDelta / Math.max(timeDelta, 0.001);
                    const smoothedSpeed = tracker.speed > 0
                        ? 0.7 * tracker.speed + 0.3 * instantSpeed
                        : instantSpeed;

                    tracker.speed = smoothedSpeed;
                    tracker.lastBytes = res.receivedBytes;
                    tracker.lastTime = now;

                    setReceiveSpeed(prev => ({ ...prev, [session.name]: smoothedSpeed }));
                    setTransferSpeed(formatSpeed(smoothedSpeed));
                }
            }
        }
    }, []);

    // Bind callbacks to NativeP2PEngine
    useEffect(() => {
        if (peer) {
            peer.setCallbacks({
                onControl: handleControlMessage,
                onData: handleBinaryData,
                onState: () => {},
            });

            // Initial announcement
            if (initialFiles.length > 0) {
                setTimeout(() => broadcastOutgoingFiles(initialFiles), 300);
            }
        }
    }, [peer, handleControlMessage, handleBinaryData, initialFiles, broadcastOutgoingFiles]);

    const executeStreamFile = async (file: File) => {
        if (!peer || !peer.isConnected) {
            toast({ title: 'Not Connected', description: 'Connection to peer was lost', variant: 'destructive' });
            return;
        }

        activeSendingFileRef.current = file.name;
        isCancelledRef.current = false;
        const startTime = Date.now();

        try {
            await peer.streamFile(
                file,
                file.name,
                (sent, total) => {
                    const pct = Math.min((sent / total) * 100, 100);
                    setSendProgress(prev => ({ ...prev, [file.name]: pct }));

                    const elapsedSec = (Date.now() - startTime) / 1000;
                    if (elapsedSec > 0.3) {
                        const bytesPerSec = sent / elapsedSec;
                        setSendSpeed(prev => ({ ...prev, [file.name]: bytesPerSec }));
                        setTransferSpeed(formatSpeed(bytesPerSec));
                    }
                },
                () => isCancelledRef.current
            );

            setSendSpeed(prev => ({ ...prev, [file.name]: 0 }));
            trackFileTransfer(file.name, file.size, file.type, 'sent');
            toast({ title: 'Sent Successfully', description: `${file.name} sent to peer` });
        } catch (err: any) {
            setSendSpeed(prev => ({ ...prev, [file.name]: 0 }));
            console.error('Error streaming file:', err);
            toast({ title: 'Transfer Error', description: err.message || 'Failed to send file', variant: 'destructive' });
        } finally {
            activeSendingFileRef.current = null;
        }
    };

    const handleFileSelect = useCallback((selectedFiles: FileList) => {
        const newFiles = Array.from(selectedFiles);
        const updated = [...outgoingFiles, ...newFiles];
        setOutgoingFiles(updated);
        broadcastOutgoingFiles(updated);
    }, [outgoingFiles, broadcastOutgoingFiles]);

    const removeOutgoingFile = (fileName: string) => {
        const updated = outgoingFiles.filter(f => f.name !== fileName);
        setOutgoingFiles(updated);
        broadcastOutgoingFiles(updated);
    };

    const requestDownload = (fileName: string) => {
        if (!peer || !peer.isConnected) return;
        peer.sendControl({
            type: 'request-file',
            payload: { fileId: fileName }
        });
        toast({ title: 'Request Sent', description: `Requesting ${fileName} from peer...` });
    };

    const downloadAllSelected = () => {
        selectedIncoming.forEach(name => requestDownload(name));
    };

    return (
        <div className="w-full max-w-4xl mx-auto space-y-6">
            {/* Direct P2P Status Banner */}
            <div className="flex items-center justify-between p-3.5 bg-card border rounded-xl shadow-xs">
                <div className="flex items-center gap-2.5">
                    <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                        <ShieldCheck className="h-5 w-5" />
                    </div>
                    <div>
                        <p className="text-sm font-semibold">Native WebRTC Direct Channel</p>
                        <p className="text-xs text-muted-foreground">Direct SCTP data stream with backpressure flow control • Zero cloud storage</p>
                    </div>
                </div>
                {transferSpeed && (
                    <Badge variant="outline" className="font-mono text-xs">
                        ⚡ {transferSpeed}
                    </Badge>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Outgoing Files (Sender) */}
                <Card>
                    <CardHeader className="p-4 sm:p-6 pb-2 sm:pb-3">
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                                <Upload className="h-4 w-4 text-primary" />
                                Send Files
                            </CardTitle>
                            <Badge variant="secondary" className="text-xs">
                                {outgoingFiles.length} available
                            </Badge>
                        </div>
                    </CardHeader>
                    <CardContent className="p-4 sm:p-6 pt-2 space-y-4">
                        <FileUpload onFileSelect={handleFileSelect} />

                        {outgoingFiles.length > 0 && (
                            <div className="space-y-2 mt-4">
                                <div className="flex justify-between items-center text-xs text-muted-foreground pb-1 border-b">
                                    <span>Selected Files</span>
                                    <Button
                                        size="sm"
                                        variant="default"
                                        className="h-7 text-xs"
                                        onClick={() => outgoingFiles.forEach(f => executeStreamFile(f))}
                                    >
                                        Send All
                                    </Button>
                                </div>
                                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                                    {outgoingFiles.map(file => {
                                        const progress = sendProgress[file.name] || 0;
                                        const isSending = activeSendingFileRef.current === file.name;

                                        return (
                                            <div key={file.name} className="p-3 bg-secondary/30 rounded-lg space-y-2 border">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-2 truncate">
                                                        <FileIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
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
                                                                <span className="text-muted-foreground text-[11px] font-medium">
                                                                    {progress >= 100 ? 'Sent' : isSending ? 'Streaming to peer...' : 'Paused'}
                                                                </span>
                                                                {isSending && (sendSpeed[file.name] || 0) > 0 && (
                                                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-mono text-[10px] font-semibold bg-primary/10 text-primary border border-primary/20">
                                                                        <Zap className="h-2.5 w-2.5 shrink-0 fill-current" />
                                                                        {formatSpeed(sendSpeed[file.name])}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div className="flex items-center gap-1.5">
                                                                {isSending && (sendSpeed[file.name] || 0) > 0 && (
                                                                    <span className="text-[10px] font-mono text-muted-foreground">
                                                                        ({formatSpeed(sendSpeed[file.name])})
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

                                                <div className="flex justify-end gap-2 pt-1">
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        className="h-6 text-xs text-destructive hover:bg-destructive/10"
                                                        onClick={() => removeOutgoingFile(file.name)}
                                                    >
                                                        <Trash2 className="h-3.5 w-3.5 mr-1" /> Remove
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        className="h-6 text-xs"
                                                        disabled={isSending || progress >= 100}
                                                        onClick={() => executeStreamFile(file)}
                                                    >
                                                        {progress >= 100 ? <Check className="h-3 w-3 mr-1 text-green-500" /> : <Upload className="h-3 w-3 mr-1" />}
                                                        {progress >= 100 ? 'Completed' : isSending ? 'Sending...' : 'Send'}
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

                {/* Incoming Files (Receiver) */}
                <Card>
                    <CardHeader className="p-4 sm:p-6 pb-2 sm:pb-3">
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                                <Download className="h-4 w-4 text-emerald-500" />
                                Received Files
                            </CardTitle>
                            <Badge variant="secondary" className="text-xs">
                                {incomingFiles.length} offered
                            </Badge>
                        </div>
                    </CardHeader>
                    <CardContent className="p-4 sm:p-6 pt-2 space-y-4">
                        {incomingFiles.length === 0 ? (
                            <div className="border border-dashed rounded-xl p-8 text-center text-muted-foreground">
                                <HardDriveDownload className="h-8 w-8 mx-auto mb-2 opacity-40 animate-pulse" />
                                <p className="text-sm">Waiting for peer to share files...</p>
                                <p className="text-xs mt-1">Files shared by peer appear here instantly</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                <div className="flex justify-between items-center text-xs text-muted-foreground pb-1 border-b">
                                    <span>Available from Peer</span>
                                    {selectedIncoming.length > 0 && (
                                        <Button size="sm" variant="default" className="h-7 text-xs" onClick={downloadAllSelected}>
                                            Download Selected ({selectedIncoming.length})
                                        </Button>
                                    )}
                                </div>

                                <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                                    {incomingFiles.map(file => {
                                        const progress = receiveProgress[file.name] || 0;
                                        const isDownloading = progress > 0 && progress < 100;
                                        const isDone = progress >= 100;

                                        return (
                                            <div key={file.name} className="p-3 bg-secondary/30 rounded-lg space-y-2 border">
                                                <div className="flex items-center justify-between gap-2">
                                                    <div className="flex items-center gap-2 truncate">
                                                        <Checkbox
                                                            checked={selectedIncoming.includes(file.name)}
                                                            onCheckedChange={(checked) => {
                                                                if (checked) {
                                                                    setSelectedIncoming(prev => [...prev, file.name]);
                                                                } else {
                                                                    setSelectedIncoming(prev => prev.filter(n => n !== file.name));
                                                                }
                                                            }}
                                                        />
                                                        <FileIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
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
                                                                <span className="text-muted-foreground text-[11px] font-medium">
                                                                    {isDone ? 'Saved to downloads' : 'Receiving stream...'}
                                                                </span>
                                                                {isDownloading && (receiveSpeed[file.name] || 0) > 0 && (
                                                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-mono text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                                                        <Zap className="h-2.5 w-2.5 shrink-0 fill-current" />
                                                                        {formatSpeed(receiveSpeed[file.name])}
                                                                    </span>
                                                                )}
                             </div>
                                                            <div className="flex items-center gap-1.5">
                                                                {isDownloading && (receiveSpeed[file.name] || 0) > 0 && (
                                                                    <span className="text-[10px] font-mono text-muted-foreground">
                                                                        ({formatSpeed(receiveSpeed[file.name])})
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

                                                <div className="flex justify-end gap-2 pt-1">
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        className="h-6 text-xs"
                                                        disabled={isDownloading || isDone}
                                                        onClick={() => requestDownload(file.name)}
                                                    >
                                                        {isDone ? (
                                                            <>
                                                                <Check className="h-3 w-3 mr-1 text-green-500" />
                                                                Saved
                                                            </>
                                                        ) : isDownloading ? (
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
        </div>
    );
}
