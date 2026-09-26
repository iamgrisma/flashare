import React, { useState } from 'react';
import { X, Copy, Check, QrCode, Smartphone, ExternalLink, CheckCircle2, RefreshCw } from 'lucide-react';

interface QRCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  roomCode: string;
  qrDataUrl: string;
  status: 'disconnected' | 'waiting' | 'connecting' | 'connected';
}

export function QRCodeModal({
  isOpen,
  onClose,
  roomCode,
  qrDataUrl,
  status,
}: QRCodeModalProps) {
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  if (!isOpen) return null;

  const joinUrl = `${window.location.origin}/?join=${roomCode}`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(joinUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(roomCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-sm rounded-3xl bg-slate-900 border border-slate-800 p-6 shadow-2xl space-y-5 text-center">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Modal Header */}
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-semibold mb-1">
            <QrCode className="w-3.5 h-3.5" />
            <span>Connect Another Device</span>
          </div>
          <h2 className="text-xl font-bold text-white">Scan to Share</h2>
          <p className="text-xs text-slate-400">
            Open camera on the second device and scan this QR code
          </p>
        </div>

        {/* QR Code Container */}
        <div className="p-3 bg-white rounded-2xl w-fit mx-auto shadow-lg">
          {qrDataUrl ? (
            <img
              src={qrDataUrl}
              alt={`QR Code for Room ${roomCode}`}
              className="w-56 h-56 rounded-lg block"
            />
          ) : (
            <div className="w-56 h-56 flex items-center justify-center text-slate-400 text-xs">
              Generating QR...
            </div>
          )}
        </div>

        {/* Room Code Display */}
        <div className="bg-slate-950/80 border border-slate-800/80 rounded-2xl p-3 flex items-center justify-between">
          <div className="text-left pl-2">
            <span className="text-[10px] uppercase font-semibold text-slate-400 block tracking-wider">
              Room Code
            </span>
            <span className="font-mono text-2xl font-black tracking-widest text-blue-400">
              {roomCode}
            </span>
          </div>
          <button
            onClick={handleCopyCode}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition"
          >
            {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            {copiedCode ? 'Copied' : 'Copy'}
          </button>
        </div>

        {/* Share Link Button */}
        <button
          onClick={handleCopyLink}
          className="w-full py-2.5 px-4 rounded-xl bg-slate-800/90 hover:bg-slate-700 border border-slate-700/60 text-slate-200 text-xs font-semibold flex items-center justify-center gap-2 transition"
        >
          {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <ExternalLink className="w-3.5 h-3.5" />}
          {copiedLink ? 'Link Copied to Clipboard!' : 'Copy Direct Share Link'}
        </button>

        {/* Connection status banner inside modal */}
        <div className="pt-1">
          {status === 'connected' ? (
            <div className="py-2 px-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-center justify-center gap-2 font-medium">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              Peer Connected! Ready to transfer.
            </div>
          ) : status === 'connecting' ? (
            <div className="py-2 px-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex items-center justify-center gap-2 font-medium">
              <RefreshCw className="w-4 h-4 animate-spin text-amber-400" />
              Peer is connecting now...
            </div>
          ) : (
            <div className="py-2 px-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-300 text-xs flex items-center justify-center gap-2 font-medium">
              <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
              Waiting for peer to scan or open link...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
