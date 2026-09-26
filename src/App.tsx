import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  ArrowDownToLine,
  QrCode,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Film,
  Music,
  Archive,
  AlertCircle,
  MessageSquare,
  ShieldCheck,
  Lock,
  RotateCcw,
} from 'lucide-react';
import { P2PManager, ManifestFile, PeerFileItem, ChatMessage, formatBytes, formatSpeed } from './lib/p2p';
import { QRScannerModal } from './components/QRScannerModal';
import { QRCodeModal } from './components/QRCodeModal';
import { ChatView } from './components/ChatView';
import { LegalModal } from './components/LegalModal';

function generateRandomCode(): string {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function getFileIcon(mime: string, name: string) {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  if (mime.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) {
    return <ImageIcon className="w-5 h-5 text-purple-400 shrink-0" />;
  }
  if (mime.startsWith('video/') || ['mp4', 'mkv', 'mov', 'avi', 'webm'].includes(ext)) {
    return <Film className="w-5 h-5 text-rose-400 shrink-0" />;
  }
  if (mime.startsWith('audio/') || ['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a'].includes(ext)) {
    return <Music className="w-5 h-5 text-amber-400 shrink-0" />;
  }
  if (mime === 'application/pdf' || ext === 'pdf') {
    return <FileText className="w-5 h-5 text-red-400 shrink-0" />;
  }
  if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2'].includes(ext)) {
    return <Archive className="w-5 h-5 text-yellow-400 shrink-0" />;
  }
  return <FileIcon className="w-5 h-5 text-blue-400 shrink-0" />;
}

export default function App() {
  // Parse initial room from URL if available (?join=ABCDE or ?room=ABCDE)
  const initialParams = new URLSearchParams(window.location.search);
  const initialJoinCode = (initialParams.get('join') || initialParams.get('room') || '').trim().toUpperCase();
  const isJoinerMode = initialJoinCode.length === 5;

  const [roomCode, setRoomCode] = useState<string>(() => (isJoinerMode ? initialJoinCode : generateRandomCode()));
  const [isJoiner, setIsJoiner] = useState<boolean>(isJoinerMode);
  const [status, setStatus] = useState<'disconnected' | 'waiting' | 'connecting' | 'connected'>('disconnected');
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [isQrModalOpen, setIsQrModalOpen] = useState<boolean>(false);
  const [isScannerOpen, setIsScannerOpen] = useState<boolean>(false);
  const [isManualJoinOpen, setIsManualJoinOpen] = useState<boolean>(false);
  const [manualCodeInput, setManualCodeInput] = useState<string>('');
  const [errorNotice, setErrorNotice] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);

  // View mode: 'grid' (symmetric Send/Receive) or 'chat' (WhatsApp-style timeline)
  const [viewMode, setViewMode] = useState<'grid' | 'chat'>('grid');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);

  // Legal modal
  const [isLegalModalOpen, setIsLegalModalOpen] = useState<boolean>(false);
  const [legalTab, setLegalTab] = useState<'privacy' | 'terms'>('privacy');

  // Send Section files: staged or sent by this device
  const [myFiles, setMyFiles] = useState<PeerFileItem[]>([]);

  // Receive Section files: offered by peer in real-time
  const [peerFiles, setPeerFiles] = useState<PeerFileItem[]>([]);

  const managerRef = useRef<P2PManager | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Generate QR code for current roomCode
  const updateQrCode = useCallback((code: string) => {
    const shareUrl = `${window.location.origin}/?join=${code}`;
    QRCode.toDataURL(shareUrl, {
      margin: 1,
      width: 320,
      color: {
        dark: '#090d16',
        light: '#ffffff',
      },
    })
      .then((url) => setQrDataUrl(url))
      .catch(console.error);
  }, []);

  // Initialize P2P manager & Auto-start connection flow
  useEffect(() => {
    const manager = new P2PManager({
      onStatusChange: (newStatus) => {
        setStatus(newStatus);
        if (newStatus === 'connected') {
          setErrorNotice(null);
        }
      },
      onRemoteManifest: (manifest: ManifestFile[]) => {
        // Real-time manifest sync with peer (<10ms latency via DataChannel)
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
              timestamp: item.timestamp || Date.now(),
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
      onChatMessage: (msg) => {
        setChatMessages((prev) => [...prev, msg]);
      },
      onError: (msg) => {
        setErrorNotice(msg);
      },
    });

    managerRef.current = manager;

    // Start appropriate role
    if (isJoinerMode) {
      setIsJoiner(true);
      manager.joinRoom(initialJoinCode);
    } else {
      setIsJoiner(false);
      manager.startHost(roomCode);
      updateQrCode(roomCode);
    }

    return () => {
      manager.disconnect();
    };
  }, []);

  // Add files to local Send Section
  const handleAddFiles = (files: FileList | File[] | null) => {
    if (!files || files.length === 0) return;
    const newItems: PeerFileItem[] = [];
    const now = Date.now();

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
        timestamp: now,
      });

      if (managerRef.current) {
        managerRef.current.registerLocalFile(id, file, now);
      }
    }

    setMyFiles((prev) => [...prev, ...newItems]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Send a chat message over WebRTC
  const handleSendMessage = (text: string) => {
    if (!managerRef.current) return;
    const sent = managerRef.current.sendChatMessage(text);
    if (sent) {
      setChatMessages((prev) => [...prev, sent]);
    }
  };

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleAddFiles(e.dataTransfer.files);
    }
  };

  // Remove file from local Send Section
  const handleRemoveFile = (id: string) => {
    setMyFiles((prev) => prev.filter((f) => f.id !== id));
    if (managerRef.current) {
      managerRef.current.removeLocalFile(id);
    }
  };

  // Request download of a file from peer
  const handleDownload = (fileId: string) => {
    if (managerRef.current) {
      managerRef.current.requestDownload(fileId);
    }
  };

  // Download all files from peer
  const handleDownloadAll = () => {
    peerFiles.forEach((f) => {
      if (f.status !== 'completed' && f.status !== 'transferring') {
        handleDownload(f.id);
      }
    });
  };

  // Join a room manually or from QR scan
  const handleJoinTargetRoom = (targetCode: string) => {
    const clean = targetCode.trim().toUpperCase();
    if (clean.length !== 5) {
      setErrorNotice('Room code must be 5 characters');
      return;
    }
    setErrorNotice(null);
    setRoomCode(clean);
    setIsJoiner(true);
    setIsScannerOpen(false);
    setIsManualJoinOpen(false);
    setChatMessages([]);
    window.history.replaceState({}, '', `/?join=${clean}`);

    if (managerRef.current) {
      managerRef.current.joinRoom(clean);
    }
  };

  // Reset / Create a new host room
  const handleResetRoom = () => {
    if (managerRef.current) {
      managerRef.current.disconnect(true);
    }
    const newCode = generateRandomCode();
    setRoomCode(newCode);
    setIsJoiner(false);
    setPeerFiles([]);
    setChatMessages([]);
    setViewMode('grid');
    setErrorNotice(null);
    window.history.replaceState({}, '', window.location.pathname);

    updateQrCode(newCode);
    if (managerRef.current) {
      managerRef.current.startHost(newCode);
    }
  };

  const openLegal = (tab: 'privacy' | 'terms') => {
    setLegalTab(tab);
    setIsLegalModalOpen(true);
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between selection:bg-blue-600 selection:text-white relative overflow-x-hidden"
    >
      {/* Hidden file input */}
      <input
        type="file"
        ref={fileInputRef}
        multiple
        className="hidden"
        onChange={(e) => handleAddFiles(e.target.files)}
      />

      {/* Drag & drop overlay */}
      {isDragging && (
        <div className="fixed inset-0 z-50 bg-blue-600/20 backdrop-blur-sm border-4 border-dashed border-blue-500 rounded-3xl m-4 flex flex-col items-center justify-center pointer-events-none animate-in fade-in duration-150">
          <UploadCloud className="w-16 h-16 text-blue-400 animate-bounce mb-3" />
          <span className="text-xl font-bold text-white">Drop files to add to Send list</span>
          <span className="text-xs text-blue-300">Files will sync instantly to the other device</span>
        </div>
      )}

      {/* Top Navbar - Clean, minimalist, responsive */}
      <header className="border-b border-slate-800/80 bg-slate-900/80 backdrop-blur-md sticky top-0 z-40 w-full">
        <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          {/* Clickable Site Title / Logo (Click to reset/home) */}
          <button
            onClick={handleResetRoom}
            className="flex items-center gap-2.5 shrink-0 text-left hover:opacity-85 transition group"
            title="FlashTransfer - Home"
          >
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-blue-500/20 shrink-0 group-hover:scale-105 transition">
              <Zap className="w-4 h-4 sm:w-5 sm:h-5 text-white fill-current" />
            </div>
            <span className="font-extrabold text-base sm:text-lg tracking-tight text-white">
              FlashTransfer
            </span>
          </button>

          {/* Top Bar: Exactly 2 Action Buttons (Reconnect and Refresh) */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Reconnect Button */}
            <button
              onClick={() => managerRef.current?.reconnect()}
              title="Reconnect to room"
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition active:scale-95 flex items-center gap-1.5 ${
                status === 'disconnected'
                  ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold shadow-md shadow-amber-500/25 animate-pulse'
                  : 'bg-slate-800/90 hover:bg-slate-700 text-slate-300 border border-slate-700/60'
              }`}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${status === 'connecting' ? 'animate-spin text-amber-400' : ''}`} />
              <span>Reconnect</span>
            </button>

            {/* Refresh / New Room Button */}
            <button
              onClick={handleResetRoom}
              title="Refresh / New Room"
              className="px-3 py-1.5 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/60 transition active:scale-95 flex items-center gap-1.5 text-xs font-semibold"
            >
              <RotateCcw className="w-3.5 h-3.5 text-blue-400" />
              <span>Refresh</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="w-full max-w-6xl mx-auto px-3 sm:px-6 py-5 sm:py-7 flex-1 space-y-5">
        {/* Error Notification Banner */}
        {errorNotice && (
          <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center justify-between gap-3 shadow-lg">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{errorNotice}</span>
            </div>
            <button
              onClick={() => setErrorNotice(null)}
              className="text-xs font-semibold text-rose-400 hover:text-rose-200 underline shrink-0"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Status Callout Banner - Features Add Chat Mode? when connected */}
        {status === 'connected' ? (
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-emerald-300 shadow-sm">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-xl bg-emerald-500/20 text-emerald-400 shrink-0">
                <CheckCircle2 className="w-4 h-4" />
              </div>
              <div>
                <span className="font-semibold text-emerald-200 text-sm">Devices Connected!</span>
                <p className="text-emerald-400/80 text-[11px] sm:text-xs">
                  Direct P2P session active. Realtime file sync &amp; ephemeral messaging ready.
                </p>
              </div>
            </div>

            {/* Add Chat Mode? Button */}
            <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
              <button
                onClick={() => setViewMode((prev) => (prev === 'grid' ? 'chat' : 'grid'))}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-md shadow-emerald-500/20 transition active:scale-95"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>{viewMode === 'grid' ? 'Add Chat Mode?' : 'File Grid View'}</span>
              </button>
            </div>
          </div>
        ) : status === 'connecting' ? (
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-3.5 flex items-center justify-between text-xs text-amber-300 shadow-sm">
            <div className="flex items-center gap-2.5">
              <RefreshCw className="w-4 h-4 text-amber-400 animate-spin shrink-0" />
              <span>Connecting to Room {roomCode}... Direct P2P handshake in progress.</span>
            </div>
            <button
              onClick={() => handleResetRoom()}
              className="text-xs font-semibold text-amber-400 hover:underline shrink-0"
            >
              Cancel
            </button>
          </div>
        ) : status === 'disconnected' ? (
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-300 shadow-sm">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-xl bg-slate-800 text-slate-400 shrink-0">
                <WifiOff className="w-4 h-4" />
              </div>
              <div>
                <span className="font-semibold text-white">Connection Paused (Room {roomCode})</span>
                <p className="text-slate-400">
                  Network hiccup detected. Click reconnect to restore session.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => managerRef.current?.reconnect()}
                className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs transition flex items-center gap-1.5 shadow-md shadow-blue-500/20 active:scale-95"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Reconnect Now
              </button>
            </div>
          </div>
        ) : (
          /* Redesigned Room Ready Box: Ask to Add this Code, centered: [Show QR] CFXX9 [Scan QR] */
          <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-5 sm:p-7 text-center space-y-4 shadow-xl backdrop-blur-sm">
            <h2 className="text-xl sm:text-2xl font-black text-white tracking-wide text-center">
              Ask to Add this Code
            </h2>

            {/* Central aligned [Show QR] CFXX9 [Scan QR] */}
            <div className="flex flex-wrap items-center justify-center gap-2.5 sm:gap-4 py-1">
              {/* Show QR button */}
              <button
                onClick={() => setIsQrModalOpen(true)}
                className="px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-2xl bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 border border-blue-500/25 text-xs sm:text-sm font-semibold transition active:scale-95 flex items-center gap-1.5 shadow-sm"
              >
                <QrCode className="w-4 h-4" />
                <span>Show QR</span>
              </button>

              {/* Big Room Code (Click to Copy or Tap) */}
              <button
                onClick={() => {
                  navigator.clipboard.writeText(roomCode);
                  setErrorNotice('Room code copied to clipboard!');
                  setTimeout(() => setErrorNotice(null), 2000);
                }}
                title="Tap to copy code"
                className="px-5 sm:px-6 py-2 rounded-2xl bg-slate-950/90 border border-slate-800 hover:border-blue-500/50 transition group flex items-center gap-2.5 shadow-inner"
              >
                <span className="font-mono text-2xl sm:text-4xl font-black tracking-widest text-blue-400 group-hover:text-blue-300">
                  {roomCode}
                </span>
                <Copy className="w-4 h-4 text-slate-500 group-hover:text-blue-400 transition" />
              </button>

              {/* Scan QR button */}
              <button
                onClick={() => setIsScannerOpen(true)}
                className="px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700/60 text-xs sm:text-sm font-semibold transition active:scale-95 flex items-center gap-1.5 shadow-sm"
              >
                <Camera className="w-4 h-4 text-indigo-400" />
                <span>Scan QR</span>
              </button>
            </div>

            <p className="text-xs text-slate-400">
              Enter this 5-digit code or scan the QR on the other device to connect instantly
            </p>
          </div>
        )}

        {/* CONTENT SWITCHER: CHAT VIEW vs 2-COLUMN FILE GRID */}
        {viewMode === 'chat' ? (
          <ChatView
            messages={chatMessages}
            myFiles={myFiles}
            peerFiles={peerFiles}
            onSendMessage={handleSendMessage}
            onAddFiles={handleAddFiles}
            onDownloadFile={handleDownload}
            roomCode={roomCode}
            status={status}
            onSwitchToGrid={() => setViewMode('grid')}
            onReconnect={() => managerRef.current?.reconnect()}
          />
        ) : (
          /* 2-COLUMN SYMMETRIC GRID (SEND ON LEFT, RECEIVE ON RIGHT) */
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-6">
            {/* ===================== SEND SECTION ===================== */}
            <div className="bg-slate-900/70 border border-slate-800 rounded-3xl p-5 sm:p-6 flex flex-col justify-between shadow-xl space-y-4">
              <div className="space-y-4">
                {/* Header */}
                <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
                  <div>
                    <h2 className="font-bold text-base text-white flex items-center gap-2">
                      <UploadCloud className="w-5 h-5 text-blue-400" />
                      Send Section
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {myFiles.length} file{myFiles.length !== 1 ? 's' : ''} staged for peer
                    </p>
                  </div>

                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition shadow-md shadow-blue-500/25 active:scale-95"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Files
                  </button>
                </div>

                {/* Local File List or Dropzone */}
                {myFiles.length === 0 ? (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-slate-700/80 hover:border-blue-500/60 rounded-2xl p-8 sm:p-12 text-center cursor-pointer bg-slate-950/40 hover:bg-slate-900/50 transition group space-y-2.5"
                  >
                    <div className="w-12 h-12 rounded-2xl bg-blue-500/10 flex items-center justify-center mx-auto text-blue-400 group-hover:scale-110 transition">
                      <UploadCloud className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-200">Click or Drag files to send</p>
                      <p className="text-xs text-slate-400 mt-1">
                        Add any images, videos, documents, or archives
                      </p>
                    </div>
                    <span className="inline-block text-[11px] text-blue-400 font-medium bg-blue-500/10 px-2.5 py-1 rounded-full border border-blue-500/20">
                      Live synced to connected peer
                    </span>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
                      {myFiles.map((file) => (
                        <div
                          key={file.id}
                          className="p-3.5 bg-slate-950/70 border border-slate-800/90 rounded-2xl space-y-2 transition hover:border-slate-700"
                        >
                          <div className="flex items-center justify-between text-xs gap-3">
                            <div className="flex items-center gap-2.5 truncate">
                              {getFileIcon(file.mime, file.name)}
                              <span className="font-semibold text-slate-200 truncate" title={file.name}>
                                {file.name}
                              </span>
                            </div>
                            <div className="flex items-center gap-2.5 shrink-0">
                              <span className="font-mono text-slate-400 text-[11px]">
                                {formatBytes(file.size)}
                              </span>
                              {file.status === 'idle' && (
                                <button
                                  onClick={() => handleRemoveFile(file.id)}
                                  title="Remove file"
                                  className="p-1 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Upload progress & transfer status */}
                          {file.status !== 'idle' ? (
                            <div className="space-y-1.5 pt-1">
                              <div className="flex justify-between text-[11px] font-mono text-slate-400">
                                <span className="flex items-center gap-1.5">
                                  {file.status === 'completed' ? (
                                    <span className="text-emerald-400 font-medium">Sent to peer ✓</span>
                                  ) : (
                                    <>
                                      <RefreshCw className="w-3 h-3 animate-spin text-blue-400" />
                                      <span>Uploading ({formatSpeed(file.speed)})</span>
                                    </>
                                  )}
                                </span>
                                <span className="font-bold text-slate-200">{file.progress}%</span>
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
                          ) : (
                            <div className="flex items-center justify-between text-[10px] text-slate-400 pt-0.5">
                              <span className={status === 'connected' ? 'text-emerald-400 font-medium' : 'text-slate-400'}>
                                {status === 'connected' ? '● Synced to peer' : '○ Ready for connection'}
                              </span>
                              <span className="text-slate-400">Available</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Add more button below list */}
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full py-2.5 rounded-xl border border-dashed border-slate-700/80 hover:border-blue-500/60 text-slate-300 hover:text-blue-400 text-xs font-semibold flex items-center justify-center gap-1.5 bg-slate-950/30 hover:bg-slate-900/40 transition"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add more files
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* ===================== RECEIVE SECTION ===================== */}
            <div className="bg-slate-900/70 border border-slate-800 rounded-3xl p-5 sm:p-6 flex flex-col justify-between shadow-xl space-y-4">
              <div className="space-y-4">
                {/* Header */}
                <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
                  <div>
                    <h2 className="font-bold text-base text-white flex items-center gap-2">
                      <FolderDown className="w-5 h-5 text-emerald-400" />
                      Receive Section
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {peerFiles.length} file{peerFiles.length !== 1 ? 's' : ''} available to download
                    </p>
                  </div>

                  {peerFiles.length > 1 && (
                    <button
                      onClick={handleDownloadAll}
                      className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition shadow-md shadow-emerald-500/25 active:scale-95"
                    >
                      <ArrowDownToLine className="w-3.5 h-3.5" /> Download All
                    </button>
                  )}
                </div>

                {/* Peer File List or Empty State */}
                {peerFiles.length === 0 ? (
                  <div className="border border-dashed border-slate-800 rounded-2xl p-8 sm:p-12 flex flex-col items-center justify-center text-center space-y-4 bg-slate-950/30">
                    {status === 'connected' ? (
                      <>
                        <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                          <FolderDown className="w-6 h-6 animate-pulse" />
                        </div>
                        <div className="space-y-1">
                          <p className="text-sm font-semibold text-slate-200">Waiting for peer to add files...</p>
                          <p className="text-xs text-slate-400 max-w-xs">
                            When the other device adds items to their Send section, they will appear here instantly in real time.
                          </p>
                        </div>
                      </>
                    ) : status === 'connecting' ? (
                      <>
                        <div className="w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-400">
                          <RefreshCw className="w-6 h-6 animate-spin" />
                        </div>
                        <div className="space-y-1">
                          <p className="text-sm font-semibold text-amber-300">Connecting to Room {roomCode}...</p>
                          <p className="text-xs text-slate-400 max-w-xs">
                            Files offered by the host will load here the moment connection is established.
                          </p>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="w-12 h-12 rounded-2xl bg-slate-800/80 flex items-center justify-center text-slate-400">
                          <WifiOff className="w-6 h-6" />
                        </div>
                        <div className="space-y-1">
                          <p className="text-sm font-semibold text-slate-300">No peer connected yet</p>
                          <p className="text-xs text-slate-400 max-w-xs">
                            Scan the QR code or share your room code with the other device to connect.
                          </p>
                        </div>

                        <div className="flex flex-wrap gap-2 pt-2 justify-center">
                          <button
                            onClick={() => setIsQrModalOpen(true)}
                            className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition flex items-center gap-1.5 shadow-md shadow-blue-500/20"
                          >
                            <QrCode className="w-3.5 h-3.5" /> Show QR Code
                          </button>
                          <button
                            onClick={() => setIsScannerOpen(true)}
                            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700/60 text-xs font-semibold transition flex items-center gap-1.5"
                          >
                            <Camera className="w-3.5 h-3.5 text-indigo-400" /> Scan QR
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2.5 max-h-[460px] overflow-y-auto pr-1">
                    {peerFiles.map((file) => (
                      <div
                        key={file.id}
                        className="p-3.5 bg-slate-950/70 border border-slate-800/90 rounded-2xl space-y-2 transition hover:border-slate-700"
                      >
                        <div className="flex items-center justify-between text-xs gap-3">
                          <div className="flex items-center gap-2.5 truncate">
                            {getFileIcon(file.mime, file.name)}
                            <span className="font-semibold text-slate-200 truncate" title={file.name}>
                              {file.name}
                            </span>
                          </div>
                          <span className="font-mono text-slate-400 text-[11px] shrink-0">
                            {formatBytes(file.size)}
                          </span>
                        </div>

                        {/* Download progress or Action Button */}
                        {file.status === 'transferring' ? (
                          <div className="space-y-1.5 pt-1">
                            <div className="flex justify-between text-[11px] font-mono text-slate-400">
                              <span className="flex items-center gap-1.5">
                                <RefreshCw className="w-3 h-3 animate-spin text-emerald-400" />
                                <span>Downloading ({formatSpeed(file.speed)})</span>
                              </span>
                              <span className="font-bold text-slate-200">{file.progress}%</span>
                            </div>
                            <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-emerald-500 transition-all duration-150"
                                style={{ width: `${file.progress}%` }}
                              />
                            </div>
                          </div>
                        ) : file.status === 'completed' ? (
                          <div className="flex items-center justify-between pt-1">
                            <span className="text-[11px] text-emerald-400 font-semibold flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Downloaded
                            </span>
                            {file.url && (
                              <a
                                href={file.url}
                                download={file.name}
                                className="px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 text-[11px] font-semibold transition"
                              >
                                Save Again
                              </a>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center justify-between pt-1">
                            <span className="text-[10px] text-slate-400">Ready to transfer</span>
                            <button
                              onClick={() => handleDownload(file.id)}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition shadow-md shadow-emerald-500/20 active:scale-95"
                            >
                              <Download className="w-3.5 h-3.5" /> Download
                            </button>
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

      {/* Footer with Legal & Architecture Links */}
      <footer className="border-t border-slate-900 bg-slate-950/80 py-4 px-4 text-center text-xs text-slate-400 space-y-2">
        <p className="flex items-center justify-center gap-1.5 text-slate-400">
          <Lock className="w-3.5 h-3.5 text-emerald-400" />
          <span>100% Direct P2P transfer over WebRTC. Zero cloud storage. No data logs.</span>
        </p>
        <div className="flex items-center justify-center gap-4 text-[11px] text-slate-400">
          <button
            onClick={() => openLegal('privacy')}
            className="hover:text-blue-400 transition underline underline-offset-2"
          >
            Privacy Policy
          </button>
          <span>•</span>
          <button
            onClick={() => openLegal('terms')}
            className="hover:text-blue-400 transition underline underline-offset-2"
          >
            Terms of Service
          </button>
          <span>•</span>
          <span className="text-slate-400">Pure Peer to Peer</span>
        </div>
      </footer>

      {/* QR Code Modal (NEVER REPLACES THE MAIN SCREEN) */}
      <QRCodeModal
        isOpen={isQrModalOpen}
        onClose={() => setIsQrModalOpen(false)}
        roomCode={roomCode}
        qrDataUrl={qrDataUrl}
        status={status}
      />

      {/* Camera QR Scanner Modal */}
      <QRScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScan={(code) => handleJoinTargetRoom(code)}
      />

      {/* Legal & Privacy Modal */}
      <LegalModal
        isOpen={isLegalModalOpen}
        onClose={() => setIsLegalModalOpen(false)}
        initialTab={legalTab}
      />

      {/* Manual Join Dialog */}
      {isManualJoinOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="w-full max-w-sm rounded-3xl bg-slate-900 border border-slate-800 p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-white">Join Room by Code</h3>
            <p className="text-xs text-slate-400">
              Enter the 5-character room code displayed on the other device.
            </p>
            <input
              type="text"
              placeholder="ENTER 5 DIGITS"
              maxLength={5}
              value={manualCodeInput}
              onChange={(e) => setManualCodeInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
              className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 rounded-xl px-4 py-3 text-center font-mono text-lg tracking-widest uppercase outline-none transition text-white"
            />
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setIsManualJoinOpen(false)}
                className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
              >
                Cancel
              </button>
              <button
                disabled={manualCodeInput.length !== 5}
                onClick={() => handleJoinTargetRoom(manualCodeInput)}
                className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs font-semibold transition shadow-md shadow-blue-500/20"
              >
                Connect
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
