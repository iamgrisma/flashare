import React, { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import {
  Zap,
  Wifi,
  WifiOff,
  Copy,
  Check,
  Camera,
  UploadCloud,
  File as FileIcon,
  Download,
  Plus,
  Trash2,
  LogOut,
  RefreshCw,
  FolderDown,
  CheckCircle2,
  HardDriveUpload,
  ArrowDownToLine,
  ArrowLeft,
} from 'lucide-react';
import { P2PManager, ManifestFile, PeerFileItem, formatBytes, formatSpeed } from './lib/p2p';
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
  const [isWaitingForPeer, setIsWaitingForPeer] = useState<boolean>(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [hasCopied, setHasCopied] = useState<boolean>(false);
  const [isScannerOpen, setIsScannerOpen] = useState<boolean>(false);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);

  // Send section files: files staged / sent by this device
  const [myFiles, setMyFiles] = useState<PeerFileItem[]>([]);

  // Receive section files: files offered by peer (synced in real-time)
  const [peerFiles, setPeerFiles] = useState<PeerFileItem[]>([]);

  const managerRef = useRef<P2PManager | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Initialize P2P manager with real-time manifest sync
  useEffect(() => {
    const manager = new P2PManager({
      onStatusChange: (newStatus) => {
        setStatus(newStatus);
        if (newStatus === 'connected') {
          setIsWaitingForPeer(false);
          setErrorNotice(null);
        }
      },
      onRemoteManifest: (manifest: ManifestFile[]) => {
        // Sync peer files with low latency (few ms)
        setPeerFiles((prev) => {
          const prevMap = new Map(prev.map((f) => [f.id, f]));
          return manifest.map((item) => {
            const existing = prevMap.get(item.id);
            if (existing) {
              return { ...existing, name: item.name, size: item.size, mime: item.mime };
            }
            return {
              id: item.id,
              name: item.name,
              size: item.size,
              mime: item.mime,
              progress: 0,
              speed: 0,
              status: 'idle',
              isLocal: false,
            };
          });
        });
      },
      onTransferProgress: (fileId, progress, speed, transferStatus, url) => {
        setMyFiles((prev) =>
          prev.map((f) =>
            f.id === fileId ? { ...f, progress, speed, status: transferStatus, url: url || f.url } : f
          )
        );
        setPeerFiles((prev) =>
          prev.map((f) =>
            f.id === fileId ? { ...f, progress, speed, status: transferStatus, url: url || f.url } : f
          )
        );
      },
      onError: (msg) => {
        setErrorNotice(msg);
      },
    });

    managerRef.current = manager;

    return () => {
      manager.disconnect();
    };
  }, []);

  // Update QR code ONLY when waiting for peer
  useEffect(() => {
    if (isWaitingForPeer && roomCode) {
      const shareUrl = `${window.location.origin}/?join=${roomCode}`;
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
    }
  }, [isWaitingForPeer, roomCode]);

  // Check URL query parameters: If someone scans QR code, they receive ?join=ABCDE
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const joinCode = params.get('join') || params.get('room');
    if (joinCode && joinCode.trim().length === 5) {
      const clean = joinCode.trim().toUpperCase();
      setRoomCode(clean);
      setIsWaitingForPeer(false);
      // Automatically connect as Joiner!
      setTimeout(() => {
        if (managerRef.current) {
          managerRef.current.joinRoom(clean);
        }
      }, 300);
    }
  }, []);

  // Add files to local Send list (works before or after connecting)
  const handleAddFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const newItems: PeerFileItem[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const id = Math.random().toString(36).substring(2, 10);

      newItems.push({
        id,
        name: file.name,
        size: file.size,
        mime: file.type || 'application/octet-stream',
        progress: 0,
        speed: 0,
        status: 'idle',
        isLocal: true,
      });

      if (managerRef.current) {
        managerRef.current.registerLocalFile(id, file);
      }
    }

    setMyFiles((prev) => [...prev, ...newItems]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRemoveFile = (id: string) => {
    setMyFiles((prev) => prev.filter((f) => f.id !== id));
    if (managerRef.current) {
      managerRef.current.removeLocalFile(id);
    }
  };

  // Creator: Starts the room and generates the live QR code
  const handleCreateRoom = () => {
    if (!managerRef.current) return;
    setIsWaitingForPeer(true);
    managerRef.current.startHost(roomCode);
  };

  // Cancel waiting room
  const handleCancelWaiting = () => {
    if (managerRef.current) {
      managerRef.current.disconnect();
    }
    setIsWaitingForPeer(false);
    setStatus('disconnected');
  };

  // Joiner: Joins an existing room
  const handleJoinRoom = (codeToJoin?: string) => {
    const target = (codeToJoin || inputCode).trim().toUpperCase();
    if (target.length !== 5) {
      setErrorNotice('Room code must be 5 characters');
      return;
    }
    setErrorNotice(null);
    setRoomCode(target);
    setIsWaitingForPeer(false);
    if (managerRef.current) {
      managerRef.current.joinRoom(target);
    }
  };

  // Request download of a peer file
  const handleDownload = (fileId: string) => {
    if (managerRef.current) {
      managerRef.current.requestDownload(fileId);
    }
  };

  // Download all peer files
  const handleDownloadAll = () => {
    peerFiles.forEach((f) => {
      if (f.status !== 'completed' && f.status !== 'transferring') {
        handleDownload(f.id);
      }
    });
  };

  const handleDisconnect = () => {
    if (managerRef.current) {
      managerRef.current.disconnect();
    }
    setStatus('disconnected');
    setIsWaitingForPeer(false);
    setPeerFiles([]);
    setRoomCode(generateRandomCode());
    // Clear URL query parameters
    window.history.replaceState({}, '', window.location.pathname);
  };

  const handleCopyLink = () => {
    const shareUrl = `${window.location.origin}/?join=${roomCode}`;
    navigator.clipboard.writeText(shareUrl);
    setHasCopied(true);
    setTimeout(() => setHasCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between selection:bg-blue-500 selection:text-white">
      {/* Hidden file input */}
      <input
        type="file"
        ref={fileInputRef}
        multiple
        className="hidden"
        onChange={(e) => handleAddFiles(e.target.files)}
      />

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
                Symmetric P2P
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
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
                  <span className="text-slate-400">Not connected</span>
                </>
              )}
            </div>

            {status === 'connected' && (
              <button
                onClick={handleDisconnect}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20 text-xs font-semibold hover:bg-rose-500/20 transition"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Leave</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 flex-1 flex flex-col justify-center">
        {errorNotice && (
          <div className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm flex items-center justify-between">
            <span>{errorNotice}</span>
            <button onClick={() => setErrorNotice(null)} className="text-xs hover:underline">
              Dismiss
            </button>
          </div>
        )}

        {status === 'connecting' ? (
          /* Connecting state (when receiver scanned QR or entered code) */
          <div className="text-center py-16 space-y-4 max-w-md mx-auto">
            <div className="w-16 h-16 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mx-auto text-blue-400">
              <RefreshCw className="w-8 h-8 animate-spin" />
            </div>
            <h2 className="text-xl font-bold text-white">Connecting to Room {roomCode}</h2>
            <p className="text-xs text-slate-400">
              Establishing direct peer-to-peer WebRTC connection...
            </p>
          </div>
        ) : status === 'waiting' || isWaitingForPeer ? (
          /* Waiting for Peer state (Room is created, QR code is LIVE) */
          <div className="space-y-6 max-w-md mx-auto w-full text-center">
            <div className="space-y-1">
              <h2 className="text-xl sm:text-2xl font-bold text-white">Room is Ready</h2>
              <p className="text-xs text-slate-400">
                Scan this QR code with the receiver's phone camera to connect instantly.
              </p>
            </div>

            {/* Live QR Code Box */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-6 space-y-4 shadow-2xl">
              {qrDataUrl && (
                <div className="p-3 bg-white rounded-2xl w-fit mx-auto shadow-md">
                  <img src={qrDataUrl} alt="Room QR Code" className="w-52 h-52 rounded-lg" />
                </div>
              )}

              <div className="space-y-1">
                <span className="text-[11px] uppercase tracking-wider text-slate-400">Room Code</span>
                <div className="text-3xl font-mono font-extrabold tracking-[0.25em] text-blue-400">
                  {roomCode}
                </div>
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

              {myFiles.length > 0 && (
                <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 text-left space-y-1.5">
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                    {myFiles.length} file{myFiles.length !== 1 ? 's' : ''} ready to send:
                  </span>
                  <div className="max-h-28 overflow-y-auto space-y-1 pr-1">
                    {myFiles.map((f) => (
                      <div key={f.id} className="flex justify-between text-xs text-slate-300">
                        <span className="truncate">{f.name}</span>
                        <span className="font-mono text-slate-400 shrink-0 ml-2">{formatBytes(f.size)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="py-2 px-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-300 text-xs flex items-center justify-center gap-2">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-400" />
                Waiting for peer to scan or connect...
              </div>

              <button
                onClick={handleCancelWaiting}
                className="w-full text-xs text-slate-400 hover:text-white transition pt-1 flex items-center justify-center gap-1"
              >
                <ArrowLeft className="w-3 h-3" /> Cancel Room
              </button>
            </div>
          </div>
        ) : status === 'disconnected' ? (
          /* Initial Screen: Select Files & Create Room OR Join with Code */
          <div className="space-y-6 max-w-2xl mx-auto w-full">
            <div className="text-center space-y-1.5">
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
                Peer-to-Peer File Transfer
              </h1>
              <p className="text-xs sm:text-sm text-slate-400 max-w-md mx-auto">
                Add files and create a room. Once the other device connects, files stream directly between browsers.
              </p>
            </div>

            {/* Creator Card */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-6 backdrop-blur-sm space-y-4 shadow-xl">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-white flex items-center gap-2">
                    <UploadCloud className="w-5 h-5 text-blue-400" />
                    Send Files
                  </h2>
                  <p className="text-xs text-slate-400">Choose files you want to share with the other device</p>
                </div>
                {myFiles.length > 0 && (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 text-xs font-semibold transition"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add more
                  </button>
                )}
              </div>

              {myFiles.length > 0 ? (
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {myFiles.map((file) => (
                    <div
                      key={file.id}
                      className="p-3 bg-slate-950/70 border border-slate-800/80 rounded-xl flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <FileIcon className="w-4 h-4 text-blue-400 shrink-0" />
                        <span className="font-medium text-slate-200 truncate">{file.name}</span>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="font-mono text-slate-400">{formatBytes(file.size)}</span>
                        <button
                          onClick={() => handleRemoveFile(file.id)}
                          className="text-slate-400 hover:text-rose-400 transition"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-slate-700/80 hover:border-blue-500/60 rounded-2xl p-7 text-center cursor-pointer bg-slate-950/40 hover:bg-slate-900/40 transition group space-y-1.5"
                >
                  <UploadCloud className="w-8 h-8 mx-auto text-slate-500 group-hover:text-blue-400 transition mb-1" />
                  <p className="text-xs font-semibold text-slate-200">Choose files to send</p>
                  <p className="text-[11px] text-slate-400">or you can add them after connecting</p>
                </div>
              )}

              <button
                onClick={handleCreateRoom}
                className="w-full py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm shadow-lg shadow-blue-500/25 transition active:scale-[0.99] flex items-center justify-center gap-2"
              >
                <Zap className="w-4 h-4" />
                Create Room & Generate QR Code
              </button>
            </div>

            {/* Joiner Card */}
            <div className="bg-slate-900/40 border border-slate-800 rounded-3xl p-6 backdrop-blur-sm space-y-4">
              <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
                Or Join an Existing Room
              </h2>

              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex flex-1 gap-2">
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
                    disabled={inputCode.length !== 5}
                    className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold text-xs transition"
                  >
                    Connect
                  </button>
                </div>

                <button
                  onClick={() => setIsScannerOpen(true)}
                  className="py-2.5 px-4 rounded-xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700/60 text-slate-300 text-xs font-semibold flex items-center justify-center gap-2 transition shrink-0"
                >
                  <Camera className="w-4 h-4 text-blue-400" />
                  Scan QR Code
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* CONNECTED: Both see the EXACT SAME Symmetric UI */
          <div className="space-y-6">
            {/* Connected Header Banner */}
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-4 flex items-center justify-between text-xs text-emerald-300">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 rounded-xl bg-emerald-500/20 text-emerald-400">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <span className="font-semibold text-sm text-emerald-200">Connected with Peer!</span>
                  <p className="text-emerald-400/80">Both devices can add and receive files in realtime with instant sync.</p>
                </div>
              </div>
              <span className="font-mono text-emerald-400 bg-emerald-950/60 px-3 py-1 rounded-lg border border-emerald-500/30">
                Room: {roomCode}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* SEND SECTION */}
              <div className="bg-slate-900/70 border border-slate-800 rounded-3xl p-5 sm:p-6 space-y-4 flex flex-col justify-between">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-bold text-base text-white flex items-center gap-2">
                        <UploadCloud className="w-5 h-5 text-blue-400" />
                        Send Section
                      </h3>
                      <p className="text-xs text-slate-400 mt-0.5">Files offered to the other device</p>
                    </div>

                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition shadow-md shadow-blue-500/20 active:scale-95"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add Files
                    </button>
                  </div>

                  {/* Send list */}
                  {myFiles.length === 0 ? (
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      className="border-2 border-dashed border-slate-700/80 hover:border-blue-500/60 rounded-2xl p-8 text-center cursor-pointer bg-slate-950/50 hover:bg-slate-900/50 transition group space-y-2"
                    >
                      <UploadCloud className="w-8 h-8 mx-auto text-slate-500 group-hover:text-blue-400 transition" />
                      <p className="text-xs font-semibold text-slate-300">Click to add files to send</p>
                      <p className="text-[11px] text-slate-400">or drag and drop them here anytime</p>
                    </div>
                  ) : (
                    <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
                      {myFiles.map((file) => (
                        <div
                          key={file.id}
                          className="p-3 bg-slate-950/70 border border-slate-800/80 rounded-xl space-y-2"
                        >
                          <div className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2 truncate">
                              <FileIcon className="w-4 h-4 text-blue-400 shrink-0" />
                              <span className="font-medium text-slate-200 truncate">{file.name}</span>
                            </div>
                            <div className="flex items-center gap-2.5 shrink-0">
                              <span className="font-mono text-slate-400">{formatBytes(file.size)}</span>
                              {file.status === 'idle' && (
                                <button
                                  onClick={() => handleRemoveFile(file.id)}
                                  className="text-slate-400 hover:text-rose-400 transition"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Transfer progress bar */}
                          {file.status !== 'idle' && (
                            <div className="space-y-1">
                              <div className="flex justify-between text-[11px] font-mono text-slate-400">
                                <span>
                                  {file.status === 'completed'
                                    ? 'Sent to peer'
                                    : `Uploading... ${formatSpeed(file.speed)}`}
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
                          )}

                          {file.status === 'idle' && (
                            <div className="flex items-center justify-between text-[10px] text-slate-400 pt-0.5">
                              <span className="text-emerald-400">● Live synced to peer</span>
                              <span>Ready</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* RECEIVE SECTION */}
              <div className="bg-slate-900/70 border border-slate-800 rounded-3xl p-5 sm:p-6 space-y-4 flex flex-col justify-between">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-bold text-base text-white flex items-center gap-2">
                        <FolderDown className="w-5 h-5 text-emerald-400" />
                        Receive Section
                      </h3>
                      <p className="text-xs text-slate-400 mt-0.5">Peer's files updated in realtime</p>
                    </div>

                    {peerFiles.length > 1 && (
                      <button
                        onClick={handleDownloadAll}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition shadow-md shadow-emerald-500/20 active:scale-95"
                      >
                        <ArrowDownToLine className="w-3.5 h-3.5" /> Download All
                      </button>
                    )}
                  </div>

                  {/* Receive list */}
                  {peerFiles.length === 0 ? (
                    <div className="h-44 border border-dashed border-slate-800 rounded-2xl flex flex-col items-center justify-center text-slate-400 text-xs p-6 text-center space-y-2">
                      <FolderDown className="w-8 h-8 text-slate-600 animate-pulse" />
                      <span>Waiting for peer to add files...</span>
                      <span className="text-[11px] text-slate-400">
                        When the other device adds items, they will appear here instantly (few ms)
                      </span>
                    </div>
                  ) : (
                    <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
                      {peerFiles.map((file) => (
                        <div
                          key={file.id}
                          className="p-3 bg-slate-950/70 border border-slate-800/80 rounded-xl space-y-2"
                        >
                          <div className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2 truncate">
                              <FileIcon className="w-4 h-4 text-emerald-400 shrink-0" />
                              <span className="font-medium text-slate-200 truncate">{file.name}</span>
                            </div>
                            <span className="font-mono text-slate-400 shrink-0">{formatBytes(file.size)}</span>
                          </div>

                          {/* Progress bar if downloading */}
                          {file.status === 'transferring' && (
                            <div className="space-y-1">
                              <div className="flex justify-between text-[11px] font-mono text-slate-400">
                                <span>Receiving... {formatSpeed(file.speed)}</span>
                                <span className="font-semibold text-slate-200">{file.progress}%</span>
                              </div>
                              <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-emerald-500 transition-all duration-150"
                                  style={{ width: `${file.progress}%` }}
                                />
                              </div>
                            </div>
                          )}

                          {/* Download / Status actions */}
                          <div className="flex justify-end pt-1">
                            {file.status === 'completed' ? (
                              <div className="flex items-center gap-2">
                                <span className="text-emerald-400 text-xs flex items-center gap-1 font-medium">
                                  <Check className="w-3.5 h-3.5" /> Downloaded
                                </span>
                                {file.url && (
                                  <a
                                    href={file.url}
                                    download={file.name}
                                    className="px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 text-xs font-semibold transition"
                                  >
                                    Save Again
                                  </a>
                                )}
                              </div>
                            ) : file.status === 'transferring' ? (
                              <span className="text-xs text-blue-400 flex items-center gap-1 font-medium">
                                <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Streaming...
                              </span>
                            ) : (
                              <button
                                onClick={() => handleDownload(file.id)}
                                className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition shadow-sm active:scale-95"
                              >
                                <Download className="w-3.5 h-3.5" /> Download
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/60 py-4 bg-slate-950/80 text-center text-xs text-slate-400">
        FlashTransfer • Pure browser-to-browser P2P file stream with instant manifest sync
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
