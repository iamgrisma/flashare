import React, { useEffect, useRef, useState, useCallback } from 'react';
import jsQR from 'jsqr';
import { Camera, X, RefreshCw, AlertCircle } from 'lucide-react';

interface QRScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (code: string) => void;
}

export function extractRoomCode(text: string): string | null {
  if (!text) return null;
  const clean = text.trim();

  // 1. Direct 5-char code
  if (/^[a-z0-9]{5}$/i.test(clean)) {
    return clean.toUpperCase();
  }

  // 2. URL query param ?join=ABCDE or ?room=ABCDE
  const matchParam = clean.match(/[?&](?:join|room)=([a-z0-9]{5})/i);
  if (matchParam && matchParam[1]) {
    return matchParam[1].toUpperCase();
  }

  // 3. Slash route /s/ABCDE or trailing /ABCDE
  const matchSlash = clean.match(/(?:\/s\/|\/)([a-z0-9]{5})(?:$|[?&#])/i);
  if (matchSlash && matchSlash[1]) {
    return matchSlash[1].toUpperCase();
  }

  return null;
}

export function QRScannerModal({ isOpen, onClose, onScan }: QRScannerModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animRef = useRef<number | null>(null);

  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [error, setError] = useState<string | null>(null);

  const stopCamera = useCallback(() => {
    if (animRef.current) {
      cancelAnimationFrame(animRef.current);
      animRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  const startCamera = useCallback(async () => {
    stopCamera();
    setError(null);

    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Camera access is not supported on this browser.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      // Start scan loop
      const scan = () => {
        const video = videoRef.current;
        const canvas = canvasRef.current;

        if (video && canvas && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          if (ctx) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(imgData.data, imgData.width, imgData.height, {
              inversionAttempts: 'dontInvert',
            });

            if (code && code.data) {
              const extracted = extractRoomCode(code.data);
              if (extracted) {
                stopCamera();
                onScan(extracted);
                onClose();
                return;
              }
            }
          }
        }
        animRef.current = requestAnimationFrame(scan);
      };

      animRef.current = requestAnimationFrame(scan);
    } catch (err: any) {
      console.error('Camera error:', err);
      setError('Could not access camera. Please allow camera permissions.');
    }
  }, [facingMode, onScan, onClose, stopCamera]);

  useEffect(() => {
    if (isOpen) {
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [isOpen, startCamera, stopCamera]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div className="relative w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Camera className="w-5 h-5 text-blue-400" />
            <h3 className="font-semibold text-slate-100 text-sm">Scan Peer QR Code</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="relative aspect-square bg-black rounded-xl overflow-hidden border border-slate-800 flex items-center justify-center">
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            className="w-full h-full object-cover"
          />
          <canvas ref={canvasRef} className="hidden" />

          {/* Scanner Reticle Overlay */}
          {!error && (
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-8">
              <div className="relative w-48 h-48 border-2 border-blue-500/40 rounded-xl">
                <div className="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-blue-400 rounded-tl-lg" />
                <div className="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-blue-400 rounded-tr-lg" />
                <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-blue-400 rounded-bl-lg" />
                <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-blue-400 rounded-br-lg" />
                <div className="absolute inset-x-2 top-0 h-0.5 bg-gradient-to-r from-transparent via-blue-400 to-transparent shadow-[0_0_8px_#38bdf8] animate-scan" />
              </div>
            </div>
          )}

          {error && (
            <div className="p-4 text-center space-y-2">
              <AlertCircle className="w-8 h-8 text-rose-500 mx-auto" />
              <p className="text-xs text-slate-300">{error}</p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between text-xs text-slate-400">
          <span>Point at sender's screen</span>
          <button
            onClick={() => setFacingMode((m) => (m === 'environment' ? 'user' : 'environment'))}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800 text-slate-200 hover:bg-slate-700 transition"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Switch Camera
          </button>
        </div>
      </div>
    </div>
  );
}
