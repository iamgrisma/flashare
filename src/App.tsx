import React, { useState, useEffect, useRef, useCallback } from 'react';
import QRCode from 'qrcode';
import {
  Zap,
  Wifi,
  WifiOff,
  Copy,
  Check,
  QrCode,
  Camera,
  UploadCloud,
  File as FileIcon,
  Download,
  Shield,
  ArrowRight,
  LogOut,
  RefreshCw,
  FolderDown,
  CheckCircle2,
} from 'lucide-react';
import { WebRTCEngine, TransferProgress, formatBytes, formatSpeed } from './lib/webrtc';
import { QRScannerModal } from './components/QRScannerModal';

function generateRandomCode(): string {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export default function App() {
  const [roomCode, setRoomCode] = useState<string>(() => generateRandomCode());
  const [inputCode, setInputCode] = useState<string>('');
  const [status, setStatus] = useState<'disconnected' | 'waiting' | 'connecting' | 'connected'>('disconnected');
  const [isHost, setIsHost] = useState<boolean>(true);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [hasCopied, setHasCopied] = useState<boolean>(false);
  const [isScannerOpen, setIsScannerOpen] = useState<boolean>(false);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);

  const [outgoingFiles, setOutgoingFiles] = useState<TransferProgress[]>([]);
  const [incomingFiles, setIncomingFiles] = useState<TransferProgress[]>([]);

  const engineRef = useRef<WebRTCEngine | null>(null);

  // Initialize WebRTC engine with callbacks
  useEffect(() => {
    const engine = new WebRTCEngine({
      onStatusChange: (newStatus) => {
        setStatus(newStatus);
        if (newStatus === 'connected') {
          setErrorNotice(null);
        }
      },
      onIncomingFile: (transfer) => {
        setIncomingFiles((prev) => {
          const idx = prev.findIndex((p) => p.fileId === transfer.fileId);
          if (idx >= 0) return prev;
          return [transfer, ...prev];
        });
      },
      onIncomingProgress: (transfer) => {
        setIncomingFiles((prev) =>
          prev.map((item) => (item.fileId === transfer.fileId ? { ...item, ...transfer } : item))
        );
      },
      onOutgoingProgress: (transfer) => {
        setOutgoingFiles((prev) =>
          prev.map((item) => (item.fileId === transfer.fileId ? { ...item, ...transfer } : item))
        );
      },
      onError: (msg) => {
        setErrorNotice(msg);
      },
    });

    engineRef.current = engine;

    return () => {
      engine.disconnect();
    };
  }, []);

  // Update QR code whenever roomCode changes
  useEffect(() => {
    const shareUrl = `${window.location.origin}/?room=${roomCode}`;
    QRCode.toDataURL(shareUrl, {
      margin: 1,
      width: 280,
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
    })
      .then((url) => setQrDataUrl(url))
      .catch(console.error);
  }, [roomCode]);

  // Check URL query parameters for auto-join
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const targetRoom = params.get('room');
    if (targetRoom && targetRoom.trim().length === 5) {
      const clean = targetRoom.trim().toUpperCase();
      setRoomCode(clean);
      setIsHost(false);
      // Auto connect as joiner
      setTimeout(() => {
        if (engineRef.current) {
          engineRef.current.connect(clean, false);
        }
      }, 300);
    }
  }, []);

  // Create room (Host mode)
  const handleCreateRoom = useCallback(() => {
    if (!engineRef.current) return;
    setIsHost(true);
    engineRef.current.connect(roomCode, true);
  }, [roomCode]);

  // Join room (Peer mode)
  const handleJoinRoom = useCallback((codeToJoin?: string) => {
    const target = (codeToJoin || inputCode).trim().toUpperCase();
    if (target.length !== 5) {
      setErrorNotice('Room code must be 5 characters');
      return;
    }
    setErrorNotice(null);
    setRoomCode(target);
    setIsHost(false);
    if (engineRef.current) {
      engineRef.current.connect(target, false);
    }
  }, [inputCode]);

  // Disconnect
  const handleDisconnect = useCallback(() => {
    if (engineRef.current) {
      engineRef.current.disconnect();
    }
    setStatus('disconnected');
    setOutgoingFiles([]);
    setIncomingFiles([]);
    setRoomCode(generateRandomCode());
  }, []);

  // Send files
  const handleFilesSelected = async (files: FileList | null) => {
    if (!files || files.length === 0 || !engineRef.current?.isConnected) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const tempId = Math.random().toString(36).substring(2, 9);
      const initialTransfer: TransferProgress = {
        fileId: tempId,
        name: file.name,
        size: file.size,
        progress: 0,
        speed: 0,
        status: 'pending',
      };

      setOutgoingFiles((prev) => [initialTransfer, ...prev]);

      try {
        await engineRef.current.sendFile(file);
      } catch (err: any) {
        console.error('File send error:', err);
        setErrorNotice(err.message || 'Failed to send file');
      }
    }
  };

  const handleCopyLink = () => {
    const shareUrl = `${window.location.origin}/?room=${roomCode}`;
    navigator.clipboard.writeText(shareUrl);
    setHasCopied(true);
    setTimeout(() => setHasCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between">
      {/* Top Navbar */}
      <header className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <Zap className="w-5 h-5 text-white fill-current" />
            </div>
            <div>
              <span className="font-bold text-lg tracking-tight text-white">FlashTransfer</span>
              <span className="hidden sm:inline-block ml-2 px-2 py-0.5 text-[10px] font-semibold tracking-wide bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-full">
                P2P Native
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Status indicator */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-800/80 border border-slate-700/60 text-xs font-medium">
              {status === 'connected' && (
                <>
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-emerald-400">Connected ({roomCode})</span>
                </>
              )}
              {status === 'connecting' && (
                <>
                  <RefreshCw className="w-3.5 h-3.5 text-amber-400 animate-spin" />
                  <span className="text-amber-400">Connecting...</span>
                </>
              )}
              {status === 'waiting' && (
                <>
                  <Wifi className="w-3.5 h-3.5 text-blue-400 animate-pulse" />
                  <span className="text-blue-400">Waiting for peer...</span>
                </>
              )}
              {status === 'disconnected' && (
                <>
                  <WifiOff className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-slate-400">Idle</span>
                </>
              )}
            </div>

            {status === 'connected' && (
              <button
                onClick={handleDisconnect}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20 text-xs font-semibold hover:bg-rose-500/20 transition"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Disconnect</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 flex-1 flex flex-col justify-center">
        {errorNotice && (
          <div className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm flex items-center justify-between">
            <span>{errorNotice}</span>
            <button onClick={() => setErrorNotice(null)} className="text-xs hover:underline">
              Dismiss
            </button>
          </div>
        )}

        {status !== 'connected' ? (
          /* Connection Setup (Host / Join) */
          <div className="space-y-8 max-w-2xl mx-auto w-full">
            <div className="text-center space-y-2">
              <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
                Direct Peer-to-Peer File Sharing
              </h1>
              <p className="text-sm sm:text-base text-slate-400 max-w-md mx-auto">
                Blazing fast, zero file limits, and end-to-end encrypted. Stream directly between any two browsers without middleman servers.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-900/60 border border-slate-800 rounded-3xl p-6 sm:p-8 backdrop-blur-sm shadow-xl">
              {/* Left Column: Create Room / Share QR */}
              <div className="space-y-4 flex flex-col justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    Option 1: Share Room Key
                  </h2>
                  <p className="text-xs text-slate-400 mb-4">
                    Open this on your other device or scan with phone camera to connect instantly.
                  </p>

                  <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 text-center space-y-3">
                    <span className="text-xs font-medium text-slate-400">Room Code</span>
                    <div className="text-3xl sm:text-4xl font-mono font-extrabold tracking-[0.25em] text-blue-400">
                      {roomCode}
                    </div>

                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={handleCopyLink}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition"
                      >
                        {hasCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        {hasCopied ? 'Link Copied!' : 'Copy Direct Link'}
                      </button>
                    </div>
                  </div>
                </div>

                {status === 'waiting' ? (
                  <div className="py-3 px-4 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-300 text-center text-xs flex items-center justify-center gap-2">
                    <RefreshCw className="w-4 h-4 animate-spin text-blue-400" />
                    Waiting for other device to join...
                  </div>
                ) : (
                  <button
                    onClick={handleCreateRoom}
                    className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold text-sm shadow-lg shadow-blue-500/25 transition active:scale-[0.98]"
                  >
                    Start Waiting for Peer
                  </button>
                )}
              </div>

              {/* Right Column: Scan QR or Enter Key */}
              <div className="space-y-4 border-t md:border-t-0 md:border-l border-slate-800 pt-6 md:pt-0 md:pl-6 flex flex-col justify-between">
                <div className="space-y-4">
                  <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    Option 2: Scan or Enter Code
                  </h2>

                  {/* QR Code preview */}
                  {qrDataUrl && (
                    <div className="flex flex-col items-center justify-center p-3 bg-white rounded-2xl w-fit mx-auto shadow-md">
                      <img src={qrDataUrl} alt="Room QR Code" className="w-36 h-36 rounded-lg" />
                    </div>
                  )}

                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="ENTER 5-DIGIT CODE"
                        value={inputCode}
                        onChange={(e) => setInputCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                        maxLength={5}
                        className="flex-1 bg-slate-950/80 border border-slate-800 focus:border-blue-500 rounded-xl px-4 py-2.5 text-center font-mono text-sm tracking-widest uppercase outline-none transition"
                      />
                      <button
                        onClick={() => handleJoinRoom()}
                        disabled={inputCode.length !== 5 || status === 'connecting'}
                        className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold text-xs transition"
                      >
                        Join
                      </button>
                    </div>

                    <button
                      onClick={() => setIsScannerOpen(true)}
                      className="w-full py-2.5 px-4 rounded-xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700/60 text-slate-300 text-xs font-semibold flex items-center justify-center gap-2 transition"
                    >
                      <Camera className="w-4 h-4 text-blue-400" />
                      Scan QR Code with Camera
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Guarantees */}
            <div className="grid grid-cols-3 gap-3 text-center text-xs text-slate-400">
              <div className="p-3 bg-slate-900/40 border border-slate-800/80 rounded-2xl space-y-1">
                <Shield className="w-4 h-4 mx-auto text-blue-400" />
                <p className="font-semibold text-slate-200">Encrypted</p>
                <p className="text-[11px] text-slate-400">WebRTC DTLS/SCTP</p>
              </div>
              <div className="p-3 bg-slate-900/40 border border-slate-800/80 rounded-2xl space-y-1">
                <Zap className="w-4 h-4 mx-auto text-blue-400" />
                <p className="font-semibold text-slate-200">Direct Speed</p>
                <p className="text-[11px] text-slate-400">No cloud throttle</p>
              </div>
              <div className="p-3 bg-slate-900/40 border border-slate-800/80 rounded-2xl space-y-1">
                <FolderDown className="w-4 h-4 mx-auto text-blue-400" />
                <p className="font-semibold text-slate-200">Zero Limits</p>
                <p className="text-[11px] text-slate-400">Send GBs of files</p>
              </div>
            </div>
          </div>
        ) : (
          /* Connected State: Symmetric Bidirectional Transfer */
          <div className="space-y-6">
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-4 flex items-center justify-between text-xs text-emerald-300">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <span className="font-semibold text-sm text-emerald-200">Peer Connected!</span>
                  <p className="text-emerald-400/80">Direct encrypted DataChannel is open. Both devices can send and receive files simultaneously.</p>
                </div>
              </div>
              <span className="font-mono text-emerald-400 bg-emerald-950/60 px-2.5 py-1 rounded-lg border border-emerald-500/30">
                Room: {roomCode}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Send Files Box */}
              <div className="bg-slate-900/70 border border-slate-800 rounded-3xl p-5 sm:p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-base text-white flex items-center gap-2">
                    <UploadCloud className="w-4 h-4 text-blue-400" />
                    Send to Peer
                  </h3>
                  <span className="text-xs text-slate-400 font-mono">
                    {outgoingFiles.length} file{outgoingFiles.length !== 1 ? 's' : ''} sent
                  </span>
                </div>

                {/* Dropzone */}
                <label className="relative flex flex-col items-center justify-center p-8 border-2 border-dashed border-slate-700 hover:border-blue-500/60 rounded-2xl cursor-pointer bg-slate-950/50 hover:bg-slate-900/50 transition-all group">
                  <input
                    type="file"
                    multiple
                    className="absolute inset-0 opacity-0 cursor-pointer"
                    onChange={(e) => handleFilesSelected(e.target.files)}
                  />
                  <UploadCloud className="w-10 h-10 text-slate-500 group-hover:text-blue-400 transition mb-2" />
                  <span className="text-sm font-semibold text-slate-200">Choose files or drag & drop</span>
                  <span className="text-xs text-slate-400 mt-1">Images, videos, documents of any size</span>
                </label>

                {/* Outgoing file transfers */}
                {outgoingFiles.length > 0 && (
                  <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                    {outgoingFiles.map((file) => (
                      <div key={file.fileId} className="p-3 bg-slate-950/70 border border-slate-800/80 rounded-xl space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2 truncate">
                            <FileIcon className="w-4 h-4 text-blue-400 shrink-0" />
                            <span className="font-medium text-slate-200 truncate">{file.name}</span>
                          </div>
                          <span className="font-mono text-slate-400 shrink-0">{formatBytes(file.size)}</span>
                        </div>

                        {/* Progress Bar */}
                        <div className="space-y-1">
                          <div className="flex justify-between text-[11px] font-mono text-slate-400">
                            <span>
                              {file.status === 'completed'
                                ? 'Delivered'
                                : `${formatSpeed(file.speed)}`}
                            </span>
                            <span className="font-semibold text-slate-200">{file.progress}%</span>
                          </div>
                          <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                            <div
                              className={`h-full transition-all duration-150 ${
                                file.status === 'completed' ? 'bg-emerald-500' : 'bg-blue-500'
                              }`}
                              style={{ width: `${file.progress}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Received Files Box */}
              <div className="bg-slate-900/70 border border-slate-800 rounded-3xl p-5 sm:p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-base text-white flex items-center gap-2">
                    <Download className="w-4 h-4 text-emerald-400" />
                    Received Files
                  </h3>
                  <span className="text-xs text-slate-400 font-mono">
                    {incomingFiles.length} file{incomingFiles.length !== 1 ? 's' : ''} received
                  </span>
                </div>

                {incomingFiles.length === 0 ? (
                  <div className="h-44 border border-dashed border-slate-800 rounded-2xl flex flex-col items-center justify-center text-slate-400 text-xs p-6 text-center space-y-2">
                    <FolderDown className="w-8 h-8 text-slate-600 animate-pulse" />
                    <span>Waiting for peer to send files...</span>
                    <span className="text-[11px] text-slate-400">Files sent by peer will download automatically here</span>
                  </div>
                ) : (
                  <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
                    {incomingFiles.map((file) => (
                      <div key={file.fileId} className="p-3 bg-slate-950/70 border border-slate-800/80 rounded-xl space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2 truncate">
                            <FileIcon className="w-4 h-4 text-emerald-400 shrink-0" />
                            <span className="font-medium text-slate-200 truncate">{file.name}</span>
                          </div>
                          <span className="font-mono text-slate-400 shrink-0">{formatBytes(file.size)}</span>
                        </div>

                        {/* Progress Bar */}
                        <div className="space-y-1">
                          <div className="flex justify-between text-[11px] font-mono text-slate-400">
                            <span>
                              {file.status === 'completed'
                                ? 'Saved to downloads'
                                : `Receiving... ${formatSpeed(file.speed)}`}
                            </span>
                            <span className="font-semibold text-slate-200">{file.progress}%</span>
                          </div>
                          <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                            <div
                              className={`h-full transition-all duration-150 ${
                                file.status === 'completed' ? 'bg-emerald-500' : 'bg-emerald-400'
                              }`}
                              style={{ width: `${file.progress}%` }}
                            />
                          </div>
                        </div>

                        {file.url && (
                          <div className="flex justify-end pt-1">
                            <a
                              href={file.url}
                              download={file.name}
                              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 text-xs font-semibold transition"
                            >
                              <Download className="w-3.5 h-3.5" />
                              Save Again
                            </a>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/60 py-4 bg-slate-950/80 text-center text-xs text-slate-400">
        FlashTransfer • Free, open-source, private browser-to-browser P2P file streaming
      </footer>

      {/* Camera QR Scanner Modal */}
      <QRScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScan={(scannedCode) => handleJoinRoom(scannedCode)}
      />
    </div>
  );
}
