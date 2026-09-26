"use client";

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Camera, RefreshCw, AlertCircle, CheckCircle2, X } from 'lucide-react';
import jsQR from 'jsqr';

interface QrScannerDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onScanSuccess: (code: string) => void;
}

/**
 * Parses raw scanned QR text or transfer URLs into a clean 5-character session key.
 */
export function extractCodeFromUrlOrText(text: string): string | null {
    if (!text) return null;
    const trimmed = text.trim();

    // Direct 5-char code (e.g. "7k9m2")
    if (/^[a-z0-9]{5}$/i.test(trimmed)) {
        return trimmed.toLowerCase();
    }

    // Direct transfer route (e.g. "https://example.com/s/7k9m2" or "/s/7k9m2")
    const matchSlashS = trimmed.match(/\/s\/([a-z0-9]{5})(?:[/?#]|$)/i);
    if (matchSlashS && matchSlashS[1]) {
        return matchSlashS[1].toLowerCase();
    }

    // Query parameters (e.g. "?code=7k9m2" or "?key=7k9m2")
    const matchParam = trimmed.match(/[?&](?:code|key)=([a-z0-9]{5})(?:[&]|$)/i);
    if (matchParam && matchParam[1]) {
        return matchParam[1].toLowerCase();
    }

    // URL path inspection
    try {
        const url = new URL(trimmed);
        const parts = url.pathname.split('/').filter(Boolean);
        for (const part of parts) {
            if (/^[a-z0-9]{5}$/i.test(part)) {
                return part.toLowerCase();
            }
        }
    } catch {}

    return null;
}

export function QrScannerDialog({ open, onOpenChange, onScanSuccess }: QrScannerDialogProps) {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const animationFrameRef = useRef<number | null>(null);

    const [hasPermission, setHasPermission] = useState<boolean | null>(null);
    const [cameraError, setCameraError] = useState<string | null>(null);
    const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
    const [scannedResult, setScannedResult] = useState<string | null>(null);
    const [isScanning, setIsScanning] = useState(false);

    // Stop all media tracks
    const stopCamera = useCallback(() => {
        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = null;
        }
        if (streamRef.current) {
            streamRef.current.getTracks().forEach((track) => track.stop());
            streamRef.current = null;
        }
        if (videoRef.current) {
            videoRef.current.srcObject = null;
        }
        setIsScanning(false);
    }, []);

    // Start video stream
    const startCamera = useCallback(async () => {
        stopCamera();
        setCameraError(null);
        setScannedResult(null);

        if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
            setCameraError('Camera access is not supported on this browser or device.');
            setHasPermission(false);
            return;
        }

        try {
            const constraints: MediaStreamConstraints = {
                video: {
                    facingMode: { ideal: facingMode },
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                },
                audio: false,
            };

            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            streamRef.current = stream;

            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                // Wait for video to be ready to play
                await videoRef.current.play();
                setHasPermission(true);
                setIsScanning(true);
            }
        } catch (err: any) {
            console.error('Camera access error:', err);
            if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                setCameraError('Camera permission was denied. Please allow camera access in your browser settings to scan QR codes.');
            } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
                setCameraError('No camera found on this device.');
            } else {
                setCameraError(err.message || 'Unable to start camera.');
            }
            setHasPermission(false);
            stopCamera();
        }
    }, [facingMode, stopCamera]);

    // Handle frame processing and QR detection
    useEffect(() => {
        if (!open || !isScanning) return;

        let active = true;

        const scanFrame = () => {
            if (!active) return;

            const video = videoRef.current;
            const canvas = canvasRef.current;

            if (video && canvas && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
                const width = video.videoWidth;
                const height = video.videoHeight;

                if (width > 0 && height > 0) {
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d', { willReadFrequently: true });

                    if (ctx) {
                        ctx.drawImage(video, 0, 0, width, height);
                        const imageData = ctx.getImageData(0, 0, width, height);

                        // Decode with jsQR
                        const qrCode = jsQR(imageData.data, imageData.width, imageData.height, {
                            inversionAttempts: 'dontInvert',
                        });

                        if (qrCode && qrCode.data) {
                            const extracted = extractCodeFromUrlOrText(qrCode.data);
                            if (extracted) {
                                // Successful detection
                                setScannedResult(extracted);
                                if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
                                    try {
                                        navigator.vibrate(50);
                                    } catch {}
                                }
                                stopCamera();

                                // Short visual confirmation delay before closing
                                setTimeout(() => {
                                    onScanSuccess(extracted);
                                    onOpenChange(false);
                                }, 600);
                                return;
                            }
                        }
                    }
                }
            }

            animationFrameRef.current = requestAnimationFrame(scanFrame);
        };

        animationFrameRef.current = requestAnimationFrame(scanFrame);

        return () => {
            active = false;
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
            }
        };
    }, [open, isScanning, onScanSuccess, onOpenChange, stopCamera]);

    // Manage camera lifecycle based on modal open state
    useEffect(() => {
        if (open) {
            startCamera();
        } else {
            stopCamera();
            setScannedResult(null);
            setCameraError(null);
        }
        return () => {
            stopCamera();
        };
    }, [open, startCamera, stopCamera]);

    const toggleFacingMode = () => {
        setFacingMode(prev => (prev === 'environment' ? 'user' : 'environment'));
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md p-4 sm:p-6 overflow-hidden">
                <DialogHeader className="space-y-1">
                    <DialogTitle className="flex items-center gap-2 text-lg">
                        <Camera className="h-5 w-5 text-primary" />
                        Scan Transfer QR Code
                    </DialogTitle>
                    <DialogDescription className="text-xs text-muted-foreground">
                        Point your camera at the QR code on the sender's screen to connect instantly.
                    </DialogDescription>
                </DialogHeader>

                <div className="relative mt-2 w-full aspect-square max-h-[340px] bg-black/95 rounded-xl overflow-hidden flex items-center justify-center border border-border shadow-inner">
                    {/* Live Video Preview */}
                    <video
                        ref={videoRef}
                        playsInline
                        muted
                        autoPlay
                        className={`w-full h-full object-cover transition-opacity duration-300 ${
                            isScanning ? 'opacity-100' : 'opacity-0'
                        }`}
                    />

                    {/* Hidden Canvas for QR Extraction */}
                    <canvas ref={canvasRef} className="hidden" />

                    {/* Scanning Viewfinder Overlay */}
                    {isScanning && !scannedResult && (
                        <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-8">
                            <div className="relative w-48 h-48 sm:w-56 sm:h-56">
                                {/* Corner targets */}
                                <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-primary rounded-tl-lg" />
                                <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-primary rounded-tr-lg" />
                                <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-primary rounded-bl-lg" />
                                <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-primary rounded-br-lg" />

                                {/* Moving Laser Scanner Line */}
                                <div className="absolute inset-x-2 top-0 h-0.5 bg-gradient-to-r from-transparent via-primary to-transparent shadow-[0_0_8px_rgba(59,130,246,0.8)] animate-[scanLaser_2.2s_easeInOut_infinite]" />
                            </div>
                        </div>
                    )}

                    {/* Success Flash / Overlay */}
                    {scannedResult && (
                        <div className="absolute inset-0 bg-emerald-950/70 backdrop-blur-xs flex flex-col items-center justify-center p-4 text-center animate-in fade-in zoom-in-95">
                            <div className="p-3 bg-emerald-500 rounded-full text-white shadow-lg shadow-emerald-500/30 mb-2">
                                <CheckCircle2 className="h-8 w-8 animate-bounce" />
                            </div>
                            <p className="text-white font-semibold text-sm">QR Code Detected!</p>
                            <p className="font-mono text-xs uppercase tracking-widest text-emerald-200 mt-1 bg-black/40 px-3 py-1 rounded-full border border-emerald-500/30">
                                Key: {scannedResult}
                            </p>
                        </div>
                    )}

                    {/* Error State */}
                    {cameraError && (
                        <div className="absolute inset-0 bg-background/95 p-6 flex flex-col items-center justify-center text-center space-y-3">
                            <div className="p-3 rounded-full bg-destructive/10 text-destructive">
                                <AlertCircle className="h-7 w-7" />
                            </div>
                            <div className="space-y-1">
                                <p className="text-sm font-semibold">Camera Unavailable</p>
                                <p className="text-xs text-muted-foreground max-w-xs">{cameraError}</p>
                            </div>
                            <Button size="sm" variant="outline" onClick={startCamera} className="mt-2 text-xs">
                                <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Try Again
                            </Button>
                        </div>
                    )}
                </div>

                {/* Footer Controls */}
                <div className="flex items-center justify-between gap-2 pt-2">
                    <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={toggleFacingMode}
                        disabled={!isScanning}
                        className="text-xs text-muted-foreground hover:text-foreground"
                    >
                        <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Switch Camera ({facingMode === 'environment' ? 'Rear' : 'Front'})
                    </Button>

                    <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => onOpenChange(false)}
                        className="text-xs"
                    >
                        <X className="mr-1.5 h-3.5 w-3.5" /> Close
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
