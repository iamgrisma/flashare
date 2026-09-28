import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import QRCode from 'qrcode';
import {
  Zap,
  WifiOff,
  Copy,
  Check,
  Camera,
  UploadCloud,
  Download,
  Plus,
  Trash2,
  LogOut,
  RefreshCw,
  FolderDown,
  CheckCircle2,
  ArrowDownToLine,
  QrCode,
  AlertCircle,
  MessageSquare,
  Clock,
  Lock,
  RotateCcw,
  Share2,
  ArrowRight,
  ArrowLeft,
  Send,
  Power,
  Menu,
  Info,
  FileText,
  Mail,
} from 'lucide-react';
import { P2PManager, ManifestFile, PeerFileItem, ChatMessage, formatBytes, formatSpeed } from './lib/p2p';
import { getFileIcon, formatTime } from './lib/fileIcon';
import { QRScannerModal, extractRoomCode } from './components/QRScannerModal';
import { QRCodeModal } from './components/QRCodeModal';
import { ChatView } from './components/ChatView';
import { LegalModal } from './components/LegalModal';
import { TopNepaliNetwork } from './components/TopNepaliNetwork';

function generateRandomCode(): string {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export default function App() {
  // Parse initial room from URL if available (?join=ABCDE, ?room=ABCDE, or /ABCDE)
  const initialParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const urlJoinCode = (
    extractRoomCode(typeof window !== 'undefined' ? window.location.href : '') ||
    initialParams.get('join') ||
    initialParams.get('room') ||
    ''
  ).trim().toUpperCase();

  const hasUrlJoin = urlJoinCode.length === 5;
  const savedHostCode = typeof window !== 'undefined' ? (sessionStorage.getItem('flash_host_code') || '').trim().toUpperCase() : '';
  const savedHostActive = typeof window !== 'undefined' && sessionStorage.getItem('flash_host_active') === 'true';

  const initialIsJoiner = hasUrlJoin;

  const [roomCode, setRoomCode] = useState<string>(() => {
    if (hasUrlJoin) return urlJoinCode;
    if (savedHostActive && savedHostCode.length === 5) return savedHostCode;
    return generateRandomCode();
  });
  const [isJoiner, setIsJoiner] = useState<boolean>(initialIsJoiner);
  const [isRoomActive, setIsRoomActive] = useState<boolean>(() => {
    if (hasUrlJoin) return true;
    if (savedHostActive && savedHostCode.length === 5) return true;
    return false;
  });
  const [isDisconnectModalOpen, setIsDisconnectModalOpen] = useState<boolean>(false);
  const [status, setStatus] = useState<'disconnected' | 'waiting' | 'connecting' | 'connected'>('disconnected');
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [isQrModalOpen, setIsQrModalOpen] = useState<boolean>(false);
  const [isScannerOpen, setIsScannerOpen] = useState<boolean>(false);
  const [inputCodeOrUrl, setInputCodeOrUrl] = useState<string>('');
  const [copiedCode, setCopiedCode] = useState<boolean>(false);
  const [copiedShareLink, setCopiedShareLink] = useState<boolean>(false);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const handleLeaveOrResetRef = useRef<() => void>(() => {});

  // View mode: 'grid' (symmetric Send/Receive) or 'chat' (WhatsApp-style timeline)
  const [viewMode, setViewMode] = useState<'grid' | 'chat'>(() => {
    if (typeof window !== 'undefined' && window.location.pathname.startsWith('/chat')) {
      return 'chat';
    }
    return 'grid';
  });
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const code = (urlJoinCode.length === 5 ? urlJoinCode : savedHostCode) || '';
        if (code) {
          const savedChat = sessionStorage.getItem(`flash_chat_${code}`);
          if (savedChat) return JSON.parse(savedChat);
        }
      } catch {}
    }
    return [];
  });

  // Persist chat messages to sessionStorage across refreshes
  useEffect(() => {
    if (typeof window !== 'undefined' && roomCode && chatMessages.length > 0) {
      sessionStorage.setItem(`flash_chat_${roomCode}`, JSON.stringify(chatMessages));
    }
  }, [chatMessages, roomCode]);
  const [gridInputText, setGridInputText] = useState<string>('');
  const [viewportHeight, setViewportHeight] = useState<number | null>(null);

  // Mobile viewport height tracking & keyboard scroll-lock
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleResize = () => {
      if (viewMode === 'chat') {
        const height = window.visualViewport ? window.visualViewport.height : window.innerHeight;
        setViewportHeight(height);
        window.scrollTo(0, 0);
      } else {
        setViewportHeight(null);
      }
    };

    handleResize();

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleResize);
      window.visualViewport.addEventListener('scroll', handleResize);
    }
    window.addEventListener('resize', handleResize);

    const preventWindowScroll = () => {
      if (viewMode === 'chat' && window.scrollY !== 0) {
        window.scrollTo(0, 0);
      }
    };
    window.addEventListener('scroll', preventWindowScroll, { passive: true });

    return () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleResize);
        window.visualViewport.removeEventListener('scroll', handleResize);
      }
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', preventWindowScroll);
    };
  }, [viewMode]);

  // Client-side navigation helpers (Strictly zero HTTP redirects)
  const navigateToChat = useCallback(() => {
    setViewMode('chat');
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (url.pathname !== '/chat') {
        url.pathname = '/chat';
        // Only preserve ?join= if this device is genuinely a Joiner!
        // Never convert a Host into a Joiner!
        if (isJoiner && roomCode) {
          url.searchParams.set('join', roomCode);
        } else {
          url.searchParams.delete('join');
          url.searchParams.delete('room');
          url.searchParams.delete('code');
        }
        window.history.pushState({ view: 'chat', room: roomCode }, '', url.pathname + url.search);
      }
    }
  }, [isJoiner, roomCode]);

  const navigateToGrid = useCallback(() => {
    setViewMode('grid');
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (url.pathname !== '/') {
        url.pathname = '/';
        // Only preserve ?join= if this device is genuinely a Joiner!
        // Never convert a Host into a Joiner!
        if (isJoiner && roomCode) {
          url.searchParams.set('join', roomCode);
        } else {
          url.searchParams.delete('join');
          url.searchParams.delete('room');
          url.searchParams.delete('code');
        }
        window.history.pushState({ view: 'grid', room: roomCode }, '', url.pathname + url.search);
      }
    }
  }, [isJoiner, roomCode]);

  // Sync route on browser back/forward buttons
  useEffect(() => {
    const handlePopState = () => {
      const isChat = window.location.pathname.startsWith('/chat');
      setViewMode(isChat ? 'chat' : 'grid');
      const currentCode = extractRoomCode(window.location.href);
      if (currentCode && currentCode !== roomCode) {
        setRoomCode(currentCode);
        setIsJoiner(true);
        setIsRoomActive(true);
        if (managerRef.current) {
          managerRef.current.joinRoom(currentCode);
        }
      } else if (!currentCode && !window.location.search.includes('join=') && window.location.pathname === '/') {
        if (isJoiner) {
          handleLeaveOrResetRef.current();
        }
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [roomCode, isJoiner]);

  // Legal modal
  const [isLegalModalOpen, setIsLegalModalOpen] = useState<boolean>(false);
  const [legalTab, setLegalTab] = useState<'about' | 'privacy' | 'terms'>('about');
  const [isMenuOpen, setIsMenuOpen] = useState<boolean>(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    if (isMenuOpen) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [isMenuOpen]);

  // Send Section files: staged or sent by this device
  const [myFiles, setMyFiles] = useState<PeerFileItem[]>([]);

  // Receive Section files: offered by peer in real-time
  const [peerFiles, setPeerFiles] = useState<PeerFileItem[]>([]);

  // Unified list of files and messages sent/staged by this device
  const sendItems = useMemo(() => {
    const list: Array<
      | { kind: 'file'; file: PeerFileItem; timestamp: number }
      | { kind: 'message'; msg: ChatMessage; timestamp: number }
    > = [];

    myFiles.forEach((file) => {
      list.push({ kind: 'file', file, timestamp: file.timestamp || 0 });
    });

    chatMessages
      .filter((m) => m.sender === 'me')
      .forEach((msg) => {
        list.push({ kind: 'message', msg, timestamp: msg.timestamp || 0 });
      });

    return list.sort((a, b) => a.timestamp - b.timestamp);
  }, [myFiles, chatMessages]);

  // Unified list of files and messages received from peer
  const receiveItems = useMemo(() => {
    const list: Array<
      | { kind: 'file'; file: PeerFileItem; timestamp: number }
      | { kind: 'message'; msg: ChatMessage; timestamp: number }
    > = [];

    peerFiles.forEach((file) => {
      list.push({ kind: 'file', file, timestamp: file.timestamp || 0 });
    });

    chatMessages
      .filter((m) => m.sender === 'peer')
      .forEach((msg) => {
        list.push({ kind: 'message', msg, timestamp: msg.timestamp || 0 });
      });

    return list.sort((a, b) => a.timestamp - b.timestamp);
  }, [peerFiles, chatMessages]);

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
        } else if (newStatus === 'disconnected') {
          setPeerFiles([]);
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
      onSessionTerminated: (reason) => {
        handleLeaveOrResetRef.current();
        setErrorNotice(reason);
      },
    });

    managerRef.current = manager;

    // Start appropriate role
    if (initialIsJoiner && urlJoinCode) {
      setIsJoiner(true);
      setIsRoomActive(true);
      manager.joinRoom(urlJoinCode);
    } else if (savedHostActive && savedHostCode.length === 5) {
      setIsJoiner(false);
      setIsRoomActive(true);
      manager.startHost(savedHostCode);
      updateQrCode(savedHostCode);
    }

    return () => {
      // Soft disconnect without deleting room from Redis on refresh
      manager.disconnect(false);
    };
  }, []);

  // Ensure host session is active on demand (Lazy creation)
  const ensureHostStarted = useCallback((targetCode?: string) => {
    if (isJoiner) return;
    const code = targetCode || roomCode;
    setIsRoomActive(true);
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('flash_host_active', 'true');
      sessionStorage.setItem('flash_host_code', code);
    }
    updateQrCode(code);
    if (managerRef.current && (!managerRef.current.isConnected && status === 'disconnected')) {
      managerRef.current.startHost(code);
    }
  }, [isJoiner, roomCode, status, updateQrCode]);

  // Add files to local Send Section
  const handleAddFiles = (files: FileList | File[] | null) => {
    if (!files || files.length === 0) return;
    ensureHostStarted();
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

  const handleSendGridMessage = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!gridInputText.trim()) return;
    ensureHostStarted();
    handleSendMessage(gridInputText.trim());
    setGridInputText('');
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

  // Join a room manually or from QR scan / input
  const handleJoinTargetRoom = (targetCode: string) => {
    const clean = targetCode.trim().toUpperCase();
    if (clean.length !== 5) {
      setErrorNotice('Room code must be 5 characters');
      return;
    }
    // Clean all previous files and state before joining
    if (managerRef.current) {
      managerRef.current.clearAllFiles();
    }
    setMyFiles([]);
    setPeerFiles([]);
    setChatMessages([]);

    setErrorNotice(null);
    setRoomCode(clean);
    setIsJoiner(true);
    setIsRoomActive(true);
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('flash_host_active');
      sessionStorage.removeItem('flash_host_code');
    }
    setIsScannerOpen(false);
    setInputCodeOrUrl('');
    window.history.replaceState({}, '', `/?join=${clean}`);

    if (managerRef.current) {
      managerRef.current.joinRoom(clean);
    }
  };

  // Clean disconnect, clear memory, wipe files, and reset to fresh state
  const handleLeaveOrReset = useCallback(() => {
    if (managerRef.current) {
      managerRef.current.disconnectPeer('Session ended');
      managerRef.current.clearAllFiles();
    }
    const freshCode = generateRandomCode();
    setRoomCode(freshCode);
    setIsJoiner(false);
    setIsRoomActive(false);
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('flash_host_active');
      sessionStorage.removeItem('flash_host_code');
      if (roomCode) sessionStorage.removeItem(`flash_chat_${roomCode}`);
    }
    setInputCodeOrUrl('');
    setMyFiles([]);
    setPeerFiles([]);
    setChatMessages([]);
    setViewMode('grid');
    setErrorNotice(null);
    setIsDisconnectModalOpen(false);
    updateQrCode(freshCode);
    window.history.replaceState({}, '', '/');
  }, [roomCode, updateQrCode]);
  handleLeaveOrResetRef.current = handleLeaveOrReset;

  // Copy room code to clipboard with visual feedback
  const handleCopyRoomCode = () => {
    navigator.clipboard.writeText(roomCode);
    setCopiedCode(true);
    setErrorNotice('Room code copied to clipboard!');
    setTimeout(() => {
      setCopiedCode(false);
      setErrorNotice(null);
    }, 2000);
  };

  // Share direct join link via Web Share API or clipboard fallback
  const handleShareLink = async () => {
    const shareUrl = `${window.location.origin}/?join=${roomCode}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'FlashTransfer',
          text: `Join my FlashTransfer room: ${roomCode}`,
          url: shareUrl,
        });
        return;
      } catch (err: any) {
        if (err.name === 'AbortError') return;
      }
    }

    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedShareLink(true);
      setErrorNotice('Direct share link copied to clipboard!');
      setTimeout(() => {
        setCopiedShareLink(false);
        setErrorNotice(null);
      }, 2000);
    } catch {
      setErrorNotice(`Share URL: ${shareUrl}`);
    }
  };

  // Submit handler for entering code or pasting URL
  const handleCodeOrUrlSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const clean = inputCodeOrUrl.trim();
    if (!clean) return;

    const extracted = extractRoomCode(clean);
    if (extracted) {
      handleJoinTargetRoom(extracted);
      return;
    }

    setErrorNotice('Please enter a valid 5-character code or a share URL containing a room code.');
  };

  const openLegal = (tab: 'about' | 'privacy' | 'terms') => {
    setLegalTab(tab);
    setIsLegalModalOpen(true);
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={viewMode === 'chat' && viewportHeight ? { height: `${viewportHeight}px`, top: 0, position: 'fixed' } : undefined}
      className={`bg-slate-950 text-slate-100 flex flex-col selection:bg-blue-600 selection:text-white relative ${
        viewMode === 'chat'
          ? 'fixed inset-0 w-screen overflow-hidden'
          : 'min-h-screen justify-between overflow-x-hidden'
      }`}
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

      {/* Top Navbar */}
      {viewMode === 'chat' ? (
        /* Unified Chat Mode Top Bar - Single Top Bar in /chat */
        <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur-md px-3 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-2 shrink-0 z-20">
          {/* Left: Back to Grid Button + Logo */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <button
              onClick={navigateToGrid}
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-slate-200 hover:text-white transition active:scale-95 text-xs font-semibold shadow-sm border border-slate-700/60"
              title="Back to File Grid"
            >
              <ArrowLeft className="w-4 h-4 text-blue-400" />
              <span>Grid View</span>
            </button>

            <div className="hidden sm:flex items-center gap-2 pl-2 border-l border-slate-800">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shadow-sm">
                <Zap className="w-3.5 h-3.5 text-white fill-current" />
              </div>
              <span className="font-extrabold text-sm tracking-tight text-white">
                FlashTransfer
              </span>
            </div>
          </div>

          {/* Middle: Live Room & Status */}
          <div className="flex items-center gap-2 px-2.5 py-1 rounded-xl bg-slate-950/70 border border-slate-800/90 text-xs">
            {status === 'connected' ? (
              <span className="flex items-center gap-1.5 text-emerald-400 font-medium">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="hidden xs:inline">Connected</span>
              </span>
            ) : status === 'connecting' ? (
              <span className="flex items-center gap-1.5 text-amber-400 font-medium">
                <RefreshCw className="w-3 h-3 text-amber-400 animate-spin" />
                <span className="hidden xs:inline">Connecting</span>
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-rose-400 font-medium">
                <span className="w-2 h-2 rounded-full bg-rose-400" />
                <span className="hidden xs:inline">Offline</span>
              </span>
            )}
            <span className="text-slate-600">•</span>
            <span className="text-slate-300 font-mono font-bold tracking-wider">
              {roomCode}
            </span>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {status === 'connected' ? (
              <button
                onClick={() => setIsDisconnectModalOpen(true)}
                className="px-2.5 sm:px-3 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-semibold transition active:scale-95 flex items-center gap-1.5 shadow-sm"
                title={isJoiner ? 'Leave Room' : 'Disconnect Session'}
              >
                <Power className="w-3.5 h-3.5 text-rose-400" />
                <span className="hidden sm:inline">{isJoiner ? 'Leave' : 'Disconnect'}</span>
              </button>
            ) : (
              <>
                {status === 'disconnected' && (
                  <button
                    onClick={() => managerRef.current?.reconnect(roomCode)}
                    className="px-2.5 sm:px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition flex items-center gap-1.5 shadow-md shadow-amber-500/20 active:scale-95 animate-pulse"
                    title="Reconnect Session"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span className="hidden sm:inline">Reconnect</span>
                  </button>
                )}
                {roomCode && (
                  <button
                    onClick={handleLeaveOrReset}
                    className="px-2.5 sm:px-3 py-1.5 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/60 text-xs font-semibold transition active:scale-95 flex items-center gap-1.5 shadow-sm"
                    title={isJoiner ? 'Leave Room' : 'Reset Room'}
                  >
                    {isJoiner ? <LogOut className="w-3.5 h-3.5 text-rose-400" /> : <RotateCcw className="w-3.5 h-3.5 text-blue-400" />}
                    <span className="hidden sm:inline">{isJoiner ? 'Leave' : 'Reset'}</span>
                  </button>
                )}
              </>
            )}

            <TopNepaliNetwork currentApp="share" />

            {/* Menu Trigger */}
            <div className="relative inline-flex items-center" ref={menuRef}>
              <button
                type="button"
                onClick={() => setIsMenuOpen((prev) => !prev)}
                className="flex items-center justify-center h-9 px-2 sm:px-2.5 rounded-xl border border-slate-700/60 bg-slate-800/90 text-slate-300 hover:text-white hover:bg-slate-700 transition active:scale-95 text-xs font-semibold cursor-pointer gap-1.5 shadow-sm"
                aria-label="Navigation Menu"
                aria-expanded={isMenuOpen}
                title="Menu"
              >
                <Menu className="w-4 h-4 text-slate-300" />
                <span className="hidden md:inline">Menu</span>
              </button>

              {isMenuOpen && (
                <div className="absolute right-0 top-full mt-2 w-48 rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl p-1.5 z-50 animate-in fade-in zoom-in-95 duration-100">
                  <button
                    type="button"
                    onClick={() => { setIsMenuOpen(false); openLegal('about'); }}
                    className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold text-slate-200 hover:bg-slate-800 hover:text-white transition flex items-center gap-2 cursor-pointer"
                  >
                    <Info className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                    <span>About FlaShare</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => { setIsMenuOpen(false); openLegal('privacy'); }}
                    className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold text-slate-200 hover:bg-slate-800 hover:text-white transition flex items-center gap-2 cursor-pointer"
                  >
                    <Lock className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>Privacy Policy</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => { setIsMenuOpen(false); openLegal('terms'); }}
                    className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold text-slate-200 hover:bg-slate-800 hover:text-white transition flex items-center gap-2 cursor-pointer"
                  >
                    <FileText className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span>Terms of Service</span>
                  </button>
                  <div className="my-1 border-t border-slate-800"></div>
                  <a
                    href="mailto:share@topnepali.com"
                    onClick={() => setIsMenuOpen(false)}
                    className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:bg-slate-800 hover:text-white transition flex items-center gap-2"
                  >
                    <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>share@topnepali.com</span>
                  </a>
                </div>
              )}
            </div>
          </div>
        </header>
      ) : (
        /* Home/Grid Mode Header */
        <header className="border-b border-slate-800/80 bg-slate-900/80 backdrop-blur-md sticky top-0 z-40 w-full shrink-0">
          <div className="w-full max-w-6xl mx-auto px-3 sm:px-6 h-16 flex items-center justify-between gap-3">
            <button
              onClick={handleLeaveOrReset}
              className="flex items-center gap-2.5 shrink-0 text-left hover:opacity-85 transition group"
              title="FlaShare - Home"
            >
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-blue-500/20 shrink-0 group-hover:scale-105 transition">
                <Zap className="w-4 h-4 sm:w-5 sm:h-5 text-white fill-current" />
              </div>
              <span className="font-extrabold text-base sm:text-lg tracking-tight text-white">
                FlaShare
              </span>
            </button>

            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              {status === 'connected' && (
                <button
                  onClick={() => setIsDisconnectModalOpen(true)}
                  className="px-2.5 sm:px-3 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-semibold transition active:scale-95 flex items-center gap-1.5 shadow-sm"
                  title="Disconnect Session"
                >
                  <Power className="w-3.5 h-3.5 text-rose-400" />
                  <span className="hidden sm:inline">Disconnect</span>
                </button>
              )}

              {status === 'disconnected' && (
                <button
                  onClick={() => managerRef.current?.reconnect()}
                  title="Reconnect to room"
                  className="px-2.5 sm:px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-md shadow-amber-500/25 animate-pulse transition active:scale-95 flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Reconnect</span>
                </button>
              )}

              {roomCode && (
                <button
                  onClick={handleLeaveOrReset}
                  title={isJoiner ? 'Leave Room' : 'Refresh / New Room'}
                  className="px-2.5 sm:px-3 py-1.5 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/60 transition active:scale-95 flex items-center gap-1.5 text-xs font-semibold"
                >
                  {isJoiner ? (
                    <>
                      <LogOut className="w-3.5 h-3.5 text-rose-400" />
                      <span className="hidden sm:inline">Leave</span>
                    </>
                  ) : (
                    <>
                      <RotateCcw className="w-3.5 h-3.5 text-blue-400" />
                      <span className="hidden sm:inline">Reset</span>
                    </>
                  )}
                </button>
              )}

              <TopNepaliNetwork currentApp="share" />

              {/* Menu Trigger */}
              <div className="relative inline-flex items-center" ref={menuRef}>
                <button
                  type="button"
                  onClick={() => setIsMenuOpen((prev) => !prev)}
                  className="flex items-center justify-center h-9 px-2 sm:px-2.5 rounded-xl border border-slate-700/60 bg-slate-800/90 text-slate-300 hover:text-white hover:bg-slate-700 transition active:scale-95 text-xs font-semibold cursor-pointer gap-1.5 shadow-sm"
                  aria-label="Navigation Menu"
                  aria-expanded={isMenuOpen}
                  title="Menu"
                >
                  <Menu className="w-4 h-4 text-slate-300" />
                  <span className="hidden md:inline">Menu</span>
                </button>

                {isMenuOpen && (
                  <div className="absolute right-0 top-full mt-2 w-48 rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl p-1.5 z-50 animate-in fade-in zoom-in-95 duration-100">
                    <button
                      type="button"
                      onClick={() => { setIsMenuOpen(false); openLegal('about'); }}
                      className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold text-slate-200 hover:bg-slate-800 hover:text-white transition flex items-center gap-2 cursor-pointer"
                    >
                      <Info className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                      <span>About FlaShare</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => { setIsMenuOpen(false); openLegal('privacy'); }}
                      className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold text-slate-200 hover:bg-slate-800 hover:text-white transition flex items-center gap-2 cursor-pointer"
                    >
                      <Lock className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span>Privacy Policy</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => { setIsMenuOpen(false); openLegal('terms'); }}
                      className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold text-slate-200 hover:bg-slate-800 hover:text-white transition flex items-center gap-2 cursor-pointer"
                    >
                      <FileText className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span>Terms of Service</span>
                    </button>
                    <div className="my-1 border-t border-slate-800"></div>
                    <a
                      href="mailto:share@topnepali.com"
                      onClick={() => setIsMenuOpen(false)}
                      className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:bg-slate-800 hover:text-white transition flex items-center gap-2"
                    >
                      <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>share@topnepali.com</span>
                    </a>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>
      )}

      {/* Main Container */}
      <main
        className={`w-full mx-auto flex-1 min-h-0 flex flex-col ${
          viewMode === 'chat'
            ? 'max-w-4xl p-0 sm:px-4 sm:pb-3 sm:pt-2 overflow-hidden'
            : 'max-w-6xl px-3 sm:px-6 py-5 sm:py-7 space-y-5'
        }`}
      >
        {/* Error Notification Banner */}
        {errorNotice && (
          <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center justify-between gap-3 shadow-lg shrink-0">
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

        {/* CONTENT SWITCHER: CHAT VIEW vs LAZY CREATION LANDING vs 2-COLUMN FILE GRID */}
        {viewMode === 'chat' ? (
          <div className="flex-1 flex flex-col min-h-0 w-full overflow-hidden">
            <ChatView
              messages={chatMessages}
              myFiles={myFiles}
              peerFiles={peerFiles}
              onSendMessage={handleSendMessage}
              onAddFiles={handleAddFiles}
              onDownloadFile={handleDownload}
            />
          </div>
        ) : !isRoomActive && !isJoiner ? (
          /* ===================== LAZY CREATION LANDING VIEW ===================== */
          <div className="space-y-6 max-w-4xl mx-auto py-2 sm:py-6 w-full">
            {/* Hero Headline */}
            <div className="text-center space-y-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-semibold">
                <Zap className="w-3.5 h-3.5 fill-current" />
                <span>Direct WebRTC P2P Transfer • 30-Min Active Sessions</span>
              </div>
              <h1 className="text-2xl sm:text-4xl font-black text-white tracking-tight">
                Instant, Private File Sharing
              </h1>
              <p className="text-xs sm:text-sm text-slate-400 max-w-lg mx-auto">
                Send files directly between devices with zero cloud uploads. No size limits, completely peer-to-peer and encrypted.
              </p>
            </div>

            {/* Dual Options: Send (Drop/Select Files) or Receive (Code/QR) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-6">
              {/* OPTION 1: SEND / SHARE (Upload to generate code) */}
              <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-6 flex flex-col justify-between space-y-5 shadow-xl hover:border-blue-500/40 transition group">
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-blue-600/15 text-blue-400 flex items-center justify-center font-bold">
                      <UploadCloud className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="font-bold text-base text-white">Share Files</h2>
                      <p className="text-xs text-slate-400">Upload to generate room code &amp; QR</p>
                    </div>
                  </div>

                  {/* Interactive Dropzone */}
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-slate-700/80 group-hover:border-blue-500/60 rounded-2xl p-6 sm:p-8 text-center cursor-pointer bg-slate-950/40 group-hover:bg-slate-900/50 transition space-y-3"
                  >
                    <div className="w-12 h-12 rounded-2xl bg-blue-500/10 flex items-center justify-center mx-auto text-blue-400 group-hover:scale-110 transition">
                      <UploadCloud className="w-6 h-6" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-slate-200">
                        Click or Drop files here
                      </p>
                      <p className="text-[11px] text-slate-400">
                        Photos, videos, PDFs, zip, or any folder
                      </p>
                    </div>
                    <button
                      type="button"
                      className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-md shadow-blue-500/25 transition active:scale-95 pointer-events-none"
                    >
                      Browse Files to Share
                    </button>
                  </div>

                  {/* Quick text send to create room */}
                  <form
                    onSubmit={handleSendGridMessage}
                    className="flex items-center gap-1.5 bg-slate-950/90 border border-slate-800 focus-within:border-blue-500 rounded-2xl p-1.5 transition shadow-inner"
                  >
                    <input
                      type="text"
                      value={gridInputText}
                      onChange={(e) => setGridInputText(e.target.value)}
                      placeholder="Or type a message to start sharing..."
                      className="flex-1 bg-transparent text-slate-100 placeholder-slate-500 px-3 py-1 text-xs outline-none"
                    />
                    <button
                      type="submit"
                      disabled={!gridInputText.trim()}
                      className="p-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-30 text-white transition active:scale-95"
                    >
                      <Send className="w-3.5 h-3.5" />
                    </button>
                  </form>
                </div>

                <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
                  <span className="flex items-center gap-1 text-blue-400">
                    <Lock className="w-3 h-3" /> End-to-end P2P
                  </span>
                  <span className="flex items-center gap-1 text-slate-400">
                    <Clock className="w-3 h-3 text-amber-400" /> 30-Min Room
                  </span>
                </div>
              </div>

              {/* OPTION 2: RECEIVE / JOIN (Enter code or scan QR) */}
              <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-6 flex flex-col justify-between space-y-5 shadow-xl hover:border-emerald-500/40 transition group">
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-emerald-600/15 text-emerald-400 flex items-center justify-center font-bold">
                      <FolderDown className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="font-bold text-base text-white">Receive Files</h2>
                      <p className="text-xs text-slate-400">Connect using code, link, or QR</p>
                    </div>
                  </div>

                  <div className="p-5 rounded-2xl bg-slate-950/50 border border-slate-800/80 space-y-4">
                    <p className="text-xs text-slate-300">
                      Have a 5-digit code or share link from another device? Enter it below:
                    </p>

                    <form onSubmit={handleCodeOrUrlSubmit} className="space-y-2.5">
                      <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 focus-within:border-emerald-500/70 rounded-2xl p-1.5 transition">
                        <input
                          type="text"
                          value={inputCodeOrUrl}
                          onChange={(e) => setInputCodeOrUrl(e.target.value)}
                          placeholder="e.g. 8492X or paste link..."
                          className="bg-transparent text-slate-100 placeholder-slate-500 px-3 py-1.5 text-xs sm:text-sm w-full outline-none font-mono"
                        />
                        <button
                          type="submit"
                          disabled={!inputCodeOrUrl.trim()}
                          className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-semibold transition active:scale-95 shrink-0 flex items-center gap-1 shadow-md shadow-emerald-500/20"
                        >
                          <span>Connect</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </form>

                    <div className="relative flex items-center justify-center">
                      <div className="border-t border-slate-800 w-full" />
                      <span className="bg-slate-950 px-2.5 text-[10px] uppercase font-bold text-slate-500 absolute">
                        or
                      </span>
                    </div>

                    <button
                      onClick={() => setIsScannerOpen(true)}
                      className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700/60 text-xs font-semibold transition flex items-center justify-center gap-2 active:scale-95 shadow-sm"
                    >
                      <Camera className="w-4 h-4 text-emerald-400" />
                      <span>Scan QR Code with Camera</span>
                    </button>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
                  <span className="flex items-center gap-1 text-emerald-400">
                    <CheckCircle2 className="w-3 h-3" /> Zero Server Relay
                  </span>
                  <span>Direct Download</span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* ===================== ACTIVE ROOM VIEW (GRID MODE) ===================== */
          <>
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

                {/* Switch to Chat Mode & Void Connection Buttons */}
                <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                  <button
                    onClick={() => setIsDisconnectModalOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 text-xs font-semibold transition active:scale-95 shadow-sm"
                  >
                    <Power className="w-3.5 h-3.5 text-rose-400" />
                    <span>Disconnect</span>
                  </button>
                  <button
                    onClick={navigateToChat}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-md shadow-emerald-500/20 transition active:scale-95"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>Switch to Chat Mode</span>
                  </button>
                </div>
              </div>
            ) : (
              <>
                {status === 'connecting' && (
                  <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-3.5 flex items-center justify-between text-xs text-amber-300 shadow-sm">
                    <div className="flex items-center gap-2.5">
                      <RefreshCw className="w-4 h-4 text-amber-400 animate-spin shrink-0" />
                      <span>Connecting to Room {roomCode}... Direct P2P handshake in progress.</span>
                    </div>
                    <button
                      onClick={handleLeaveOrReset}
                      className="text-xs font-semibold text-amber-400 hover:underline shrink-0"
                    >
                      Cancel
                    </button>
                  </div>
                )}

                {status === 'disconnected' && (
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
                      <button
                        onClick={handleLeaveOrReset}
                        className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition flex items-center gap-1.5 shadow-sm active:scale-95"
                      >
                        <RotateCcw className="w-3.5 h-3.5" /> Start New Room
                      </button>
                    </div>
                  </div>
                )}

                {!isJoiner ? (
                  /* Redesigned Room Ready Box for Host */
                  <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-5 sm:p-7 text-center space-y-4 shadow-xl backdrop-blur-sm relative overflow-hidden">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                      <span>Active for 30 Minutes • Ready to Share</span>
                    </div>

                    <h2 className="text-xl sm:text-2xl font-black text-white tracking-wide text-center">
                      Ask Recipient to Add this Code
                    </h2>

                    {/* Row 1: [Show QR] [CODEXXX] [Share Link] */}
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
                        onClick={handleCopyRoomCode}
                        title="Tap to copy code"
                        className="px-5 sm:px-6 py-2 rounded-2xl bg-slate-950/90 border border-slate-800 hover:border-blue-500/50 transition group flex items-center gap-2.5 shadow-inner"
                      >
                        <span className="font-mono text-2xl sm:text-4xl font-black tracking-widest text-blue-400 group-hover:text-blue-300">
                          {roomCode}
                        </span>
                        {copiedCode ? (
                          <Check className="w-4 h-4 text-emerald-400" />
                        ) : (
                          <Copy className="w-4 h-4 text-slate-500 group-hover:text-blue-400 transition" />
                        )}
                      </button>

                      {/* Share Link button with text */}
                      <button
                        onClick={handleShareLink}
                        title="Share or copy direct link"
                        className="px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-2xl bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400 border border-indigo-500/25 text-xs sm:text-sm font-semibold transition active:scale-95 flex items-center gap-1.5 shadow-sm"
                      >
                        {copiedShareLink ? (
                          <>
                            <Check className="w-4 h-4 text-emerald-400" />
                            <span className="text-emerald-300">Link Copied!</span>
                          </>
                        ) : (
                          <>
                            <Share2 className="w-4 h-4" />
                            <span>Share Link</span>
                          </>
                        )}
                      </button>
                    </div>

                    {/* Row 2: [Scan QR] or [Enter Code or URL + Connect] */}
                    <div className="flex flex-wrap items-center justify-center gap-2.5 sm:gap-3.5 pt-1 max-w-xl mx-auto">
                      {/* Scan QR button */}
                      <button
                        onClick={() => setIsScannerOpen(true)}
                        className="px-3.5 sm:px-4 py-2.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700/60 text-xs sm:text-sm font-semibold transition active:scale-95 flex items-center gap-1.5 shadow-sm shrink-0"
                      >
                        <Camera className="w-4 h-4 text-indigo-400" />
                        <span>Scan QR</span>
                      </button>

                      <span className="text-xs font-bold text-slate-500 uppercase tracking-wider shrink-0">
                        or
                      </span>

                      {/* Enter Code or URL form */}
                      <form
                        onSubmit={handleCodeOrUrlSubmit}
                        className="flex items-center gap-1.5 bg-slate-950/90 border border-slate-800 focus-within:border-blue-500/70 rounded-2xl p-1 sm:p-1.5 transition shadow-inner flex-1 min-w-[240px]"
                      >
                        <input
                          type="text"
                          value={inputCodeOrUrl}
                          onChange={(e) => setInputCodeOrUrl(e.target.value)}
                          placeholder="Enter 5-digit code or URL..."
                          className="bg-transparent text-slate-100 placeholder-slate-500 px-3 py-1.5 text-xs sm:text-sm w-full outline-none font-mono"
                        />
                        <button
                          type="submit"
                          disabled={!inputCodeOrUrl.trim()}
                          className="px-3.5 py-1.5 sm:py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:hover:bg-blue-600 text-white text-xs font-semibold transition shadow-md shadow-blue-500/20 active:scale-95 shrink-0 flex items-center gap-1"
                        >
                          <span>Connect</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </form>
                    </div>

                    <p className="text-xs text-slate-400">
                      Enter this 5-digit code or scan the QR on the other device to connect instantly
                    </p>
                  </div>
                ) : (
                  /* Joiner Room Status Box when disconnected/connecting */
                  <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-5 sm:p-7 text-center space-y-4 shadow-xl backdrop-blur-sm">
                    <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-medium">
                      <span>Joined Room</span>
                      <span className="text-slate-500">•</span>
                      <span className="font-mono font-bold text-white">{roomCode}</span>
                    </div>

                    <h2 className="text-xl sm:text-2xl font-black text-white tracking-wide">
                      {status === 'connecting'
                        ? 'Connecting to Host...'
                        : 'Connection to Host Paused'}
                    </h2>

                    <p className="text-xs sm:text-sm text-slate-400 max-w-md mx-auto">
                      {status === 'connecting'
                        ? 'Negotiating direct peer-to-peer WebRTC connection with the host device...'
                        : 'The host has disconnected or the session was paused. You can reconnect or leave the room.'}
                    </p>

                    <div className="flex items-center justify-center gap-3 pt-2">
                      <button
                        onClick={() => managerRef.current?.reconnect()}
                        className="px-5 py-2.5 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs sm:text-sm transition flex items-center gap-2 shadow-lg shadow-blue-500/25 active:scale-95"
                      >
                        <RefreshCw className={`w-4 h-4 ${status === 'connecting' ? 'animate-spin' : ''}`} />
                        <span>Reconnect to Host</span>
                      </button>
                      <button
                        onClick={handleLeaveOrReset}
                        className="px-5 py-2.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700/60 text-xs sm:text-sm font-semibold transition active:scale-95 flex items-center gap-2 shadow-sm"
                      >
                        <LogOut className="w-4 h-4 text-rose-400" />
                        <span>Leave Room</span>
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* 2-COLUMN SYMMETRIC GRID (SEND ON LEFT, RECEIVE ON RIGHT) */}
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
                      {myFiles.length} file{myFiles.length !== 1 ? 's' : ''}
                      {chatMessages.filter((m) => m.sender === 'me').length > 0
                        ? `, ${chatMessages.filter((m) => m.sender === 'me').length} message${chatMessages.filter((m) => m.sender === 'me').length !== 1 ? 's' : ''}`
                        : ''}{' '}
                      staged/sent
                    </p>
                  </div>

                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition shadow-md shadow-blue-500/25 active:scale-95"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Files
                  </button>
                </div>

                {/* Send Section Chat & Add Files Bar */}
                <form
                  onSubmit={handleSendGridMessage}
                  className="flex items-center gap-1.5 bg-slate-950/90 border border-slate-800 focus-within:border-blue-500 rounded-2xl p-1.5 transition shadow-inner"
                >
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    title="Add / Attach Files"
                    className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 transition active:scale-95 shrink-0"
                  >
                    <Plus className="w-4 h-4 text-blue-400" />
                  </button>
                  <input
                    type="text"
                    value={gridInputText}
                    onChange={(e) => setGridInputText(e.target.value)}
                    placeholder="Type message or click + to add files..."
                    className="flex-1 bg-transparent text-slate-100 placeholder-slate-500 px-2.5 py-1 text-xs sm:text-sm outline-none"
                  />
                  <button
                    type="submit"
                    disabled={!gridInputText.trim()}
                    title="Send message"
                    className="p-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white transition active:scale-95 shrink-0 shadow-md shadow-blue-500/20"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </form>

                {/* Local Files and Messages List or Dropzone */}
                {sendItems.length === 0 ? (
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
                        Add images, videos, documents, or type a message above
                      </p>
                    </div>
                    <span className="inline-block text-[11px] text-blue-400 font-medium bg-blue-500/10 px-2.5 py-1 rounded-full border border-blue-500/20">
                      Live synced to connected peer
                    </span>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
                      {sendItems.map((entry) => {
                        if (entry.kind === 'file') {
                          const file = entry.file;
                          return (
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
                          );
                        }

                        // Message entry in Send Section
                        const msg = entry.msg;
                        return (
                          <div
                            key={msg.id}
                            className="p-3 bg-blue-950/40 border border-blue-500/30 rounded-2xl space-y-1.5 transition hover:border-blue-500/50"
                          >
                            <div className="flex items-center justify-between text-[11px] text-blue-300">
                              <span className="flex items-center gap-1.5 font-semibold">
                                <MessageSquare className="w-3.5 h-3.5 text-blue-400" />
                                <span>You</span>
                              </span>
                              <span className="text-[10px] text-slate-400 font-mono">
                                {formatTime(msg.timestamp)}
                              </span>
                            </div>
                            <p className="text-xs sm:text-sm text-slate-100 whitespace-pre-wrap break-words">
                              {msg.text}
                            </p>
                            <div className="flex items-center justify-between text-[10px] text-blue-400/80 pt-0.5">
                              <span>{status === 'connected' ? '● Sent to peer' : '○ Pending connection'}</span>
                            </div>
                          </div>
                        );
                      })}
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
                      {peerFiles.length} file{peerFiles.length !== 1 ? 's' : ''}
                      {chatMessages.filter((m) => m.sender === 'peer').length > 0
                        ? `, ${chatMessages.filter((m) => m.sender === 'peer').length} message${chatMessages.filter((m) => m.sender === 'peer').length !== 1 ? 's' : ''}`
                        : ''}{' '}
                      received
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

                {/* Peer Items (Files + Messages) List or Empty State */}
                {receiveItems.length === 0 ? (
                  <div className="border border-dashed border-slate-800 rounded-2xl p-8 sm:p-12 flex flex-col items-center justify-center text-center space-y-4 bg-slate-950/30">
                    {status === 'connected' ? (
                      <>
                        <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                          <FolderDown className="w-6 h-6 animate-pulse" />
                        </div>
                        <div className="space-y-1">
                          <p className="text-sm font-semibold text-slate-200">Waiting for peer to add files or messages...</p>
                          <p className="text-xs text-slate-400 max-w-xs">
                            When the other device sends a message or adds items to their Send section, they will appear here instantly in real time.
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
                            Files and messages offered by the host will load here the moment connection is established.
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
                    {receiveItems.map((entry) => {
                      if (entry.kind === 'file') {
                        const file = entry.file;
                        return (
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
                        );
                      }

                      // Message entry in Receive Section
                      const msg = entry.msg;
                      return (
                        <div
                          key={msg.id}
                          className="p-3.5 bg-slate-950/80 border border-slate-800 rounded-2xl space-y-1.5 transition hover:border-slate-700"
                        >
                          <div className="flex items-center justify-between text-[11px] text-emerald-400">
                            <span className="flex items-center gap-1.5 font-semibold">
                              <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />
                              <span>Peer</span>
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono">
                              {formatTime(msg.timestamp)}
                            </span>
                          </div>
                          <p className="text-xs sm:text-sm text-slate-200 whitespace-pre-wrap break-words">
                            {msg.text}
                          </p>
                          <div className="text-[10px] text-slate-500 pt-0.5">
                            Direct P2P message
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
          </>
        )}
      </main>

      {/* Full Unified 4-Column Ecosystem Footer - Hidden in Chat Mode */}
      {viewMode !== 'chat' && (
        <footer className="mt-auto border-t border-slate-800/80 bg-slate-950 text-slate-400 text-xs shrink-0">
          <div className="max-w-6xl w-full mx-auto px-4 sm:px-6 py-12">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-10 text-left">
              {/* Col 1: FlaShare Features */}
              <div>
                <h4 className="font-bold text-slate-100 uppercase tracking-wider text-[11px] mb-3.5">
                  FlaShare Features
                </h4>
                <ul className="space-y-2">
                  <li><span className="text-slate-300">Direct WebRTC P2P</span></li>
                  <li><span className="text-slate-300">Memory Stream (Zero Storage)</span></li>
                  <li><span className="text-slate-300">Ephemeral Encrypted Chat</span></li>
                  <li><span className="text-slate-300">Instant QR &amp; Code Pairing</span></li>
                  <li><span className="text-slate-300">No File Size Limits</span></li>
                </ul>
              </div>

              {/* Col 2: About & Legal */}
              <div>
                <h4 className="font-bold text-slate-100 uppercase tracking-wider text-[11px] mb-3.5">
                  About &amp; Legal
                </h4>
                <ul className="space-y-2">
                  <li>
                    <button
                      onClick={() => openLegal('about')}
                      className="hover:text-white transition cursor-pointer text-left"
                    >
                      About FlaShare
                    </button>
                  </li>
                  <li>
                    <button
                      onClick={() => openLegal('privacy')}
                      className="hover:text-white transition cursor-pointer text-left"
                    >
                      Privacy Policy
                    </button>
                  </li>
                  <li>
                    <button
                      onClick={() => openLegal('terms')}
                      className="hover:text-white transition cursor-pointer text-left"
                    >
                      Terms of Service
                    </button>
                  </li>
                  <li>
                    <a
                      href="mailto:share@topnepali.com"
                      className="hover:text-white transition"
                    >
                      share@topnepali.com
                    </a>
                  </li>
                </ul>
              </div>

              {/* Col 3: TopNepali Network Ecosystem */}
              <div>
                <h4 className="font-bold text-slate-100 uppercase tracking-wider text-[11px] mb-3.5">
                  TopNepali Network
                </h4>
                <ul className="space-y-2">
                  <li><a href="https://topnepali.com" className="hover:text-white transition">TopNepali Hub</a></li>
                  <li><a href="https://topnepali.com/tools" className="hover:text-white transition">TopTools Suite</a></li>
                  <li><a href="https://typing.topnepali.com" className="hover:text-white transition">Nepali Typing Platform</a></li>
                  <li><a href="https://fonts.topnepali.com" className="hover:text-white transition">FontsDir Typography</a></li>
                  <li><a href="https://election.topnepali.com" className="hover:text-white transition">Election Nepal Archive</a></li>
                  <li><a href="https://constitution.topnepali.com" className="hover:text-white transition">Nepal Constitution</a></li>
                </ul>
              </div>

              {/* Col 4: Platform Security & Identity */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-6 h-6 rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center text-white">
                    <Zap className="w-3.5 h-3.5 fill-current" />
                  </div>
                  <span className="font-bold text-sm text-slate-100">
                    FlaShare <span className="text-blue-400">P2P</span>
                  </span>
                </div>
                <p className="text-slate-400 leading-relaxed text-[11px] mb-3">
                  Direct browser-to-browser file sharing and messaging powered by WebRTC. Zero cloud storage, zero tracking, and complete privacy.
                </p>
                <div className="flex items-center gap-1.5 text-[11px] text-emerald-400 font-semibold">
                  <Lock className="w-3.5 h-3.5" />
                  <span>DTLS-SRTP End-to-End Encrypted</span>
                </div>
              </div>
            </div>

            {/* Bottom Bar */}
            <div className="border-t border-slate-900 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px] text-slate-500">
              <p>&copy; {new Date().getFullYear()} TopNepali. All rights reserved.</p>
              <div className="flex items-center gap-4">
                <button onClick={() => openLegal('privacy')} className="hover:text-slate-300 transition cursor-pointer">
                  Privacy Policy
                </button>
                <button onClick={() => openLegal('terms')} className="hover:text-slate-300 transition cursor-pointer">
                  Terms of Service
                </button>
                <a href="mailto:share@topnepali.com" className="hover:text-slate-300 transition">
                  Support &amp; Contact
                </a>
              </div>
            </div>
          </div>
        </footer>
      )}

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


      {/* Disconnect Modal */}
      {isDisconnectModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="w-full max-w-sm rounded-3xl bg-slate-900 border border-slate-800 p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400">
                <Power className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">
                  {isJoiner ? 'Leave Room?' : 'End Session?'}
                </h3>
                <p className="text-xs text-slate-400">
                  Room: <span className="font-mono font-bold text-blue-400">{roomCode}</span>
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              {isJoiner
                ? 'Are you sure you want to disconnect from host and leave this room? Active transfers will stop.'
                : 'Are you sure you want to end this session? Memory will be wiped and a fresh code will be generated.'}
            </p>

            <div className="flex gap-2.5 pt-2">
              <button
                onClick={() => setIsDisconnectModalOpen(false)}
                className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
              >
                Cancel
              </button>
              <button
                onClick={handleLeaveOrReset}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold transition shadow-md shadow-rose-600/25 active:scale-95 flex items-center justify-center gap-1.5"
              >
                <Power className="w-3.5 h-3.5" />
                <span>{isJoiner ? 'Leave Room' : 'End Session'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
