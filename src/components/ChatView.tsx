import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Send,
  Paperclip,
  Download,
  CheckCircle2,
  RefreshCw,
  Lock,
  ArrowLeft,
  File as FileIcon,
  Image as ImageIcon,
  Film,
  Music,
  Archive,
  FileText,
  ShieldAlert,
} from 'lucide-react';
import { ChatMessage, PeerFileItem, formatBytes, formatSpeed } from '../lib/p2p';

interface ChatViewProps {
  messages: ChatMessage[];
  myFiles: PeerFileItem[];
  peerFiles: PeerFileItem[];
  onSendMessage: (text: string) => void;
  onAddFiles: (files: FileList | null) => void;
  onDownloadFile: (fileId: string) => void;
  roomCode: string;
  status: string;
  onSwitchToGrid: () => void;
  onReconnect?: () => void;
}

type TimelineItem =
  | { type: 'chat'; data: ChatMessage; timestamp: number }
  | { type: 'file'; data: PeerFileItem; timestamp: number };

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

function formatTime(ts: number): string {
  if (!ts) return '';
  const date = new Date(ts);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function ChatView({
  messages,
  myFiles,
  peerFiles,
  onSendMessage,
  onAddFiles,
  onDownloadFile,
  roomCode,
  status,
  onSwitchToGrid,
  onReconnect,
}: ChatViewProps) {
  const [inputText, setInputText] = useState('');
  const chatBottomRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Combine text messages and files into a unified chronological timeline
  const timeline = useMemo(() => {
    const list: TimelineItem[] = [];

    messages.forEach((msg) => {
      list.push({ type: 'chat', data: msg, timestamp: msg.timestamp });
    });

    myFiles.forEach((file) => {
      list.push({ type: 'file', data: file, timestamp: file.timestamp || 0 });
    });

    peerFiles.forEach((file) => {
      list.push({ type: 'file', data: file, timestamp: file.timestamp || 0 });
    });

    return list.sort((a, b) => a.timestamp - b.timestamp);
  }, [messages, myFiles, peerFiles]);

  // Auto-scroll to bottom on new message or file
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [timeline.length]);

  const handleSend = () => {
    if (!inputText.trim()) return;
    onSendMessage(inputText);
    setInputText('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-3xl flex flex-col h-[75vh] min-h-[500px] max-h-[720px] shadow-2xl overflow-hidden relative">
      {/* Hidden file input for attachment button */}
      <input
        type="file"
        ref={fileInputRef}
        multiple
        className="hidden"
        onChange={(e) => onAddFiles(e.target.files)}
      />

      {/* Top Header of Chat */}
      <div className="p-3.5 sm:p-4 border-b border-slate-800 bg-slate-950/70 backdrop-blur-md flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2.5">
          <button
            onClick={onSwitchToGrid}
            className="p-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition flex items-center gap-1 text-xs font-medium"
            title="Back to File Grid"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Grid View</span>
          </button>

          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-white">P2P Live Session</span>
              {status === 'connected' ? (
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              ) : status === 'connecting' ? (
                <RefreshCw className="w-3 h-3 text-amber-400 animate-spin" />
              ) : (
                <span className="w-2 h-2 rounded-full bg-rose-400" />
              )}
            </div>
            <span className="text-[11px] text-slate-400">Room: {roomCode}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {status === 'disconnected' && onReconnect && (
            <button
              onClick={onReconnect}
              className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition flex items-center gap-1.5 shadow-md shadow-amber-500/20 active:scale-95 animate-pulse"
            >
              <RefreshCw className="w-3 h-3" /> Reconnect
            </button>
          )}

          <button
            onClick={onSwitchToGrid}
            className="px-3 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 border border-slate-700/60 text-slate-200 text-xs font-semibold transition"
          >
            Switch to File Grid
          </button>
        </div>
      </div>

      {/* Ephemeral Notice Banner */}
      <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2 flex items-center gap-2 text-[11px] text-amber-300 shrink-0">
        <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
        <span>
          <strong>Ephemeral P2P Session:</strong> Not stored on any server. All messages &amp; files will be wiped permanently on disconnect.
        </span>
      </div>

      {/* Messages Timeline */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3.5">
        {timeline.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-slate-400 space-y-2 p-6">
            <div className="w-12 h-12 rounded-2xl bg-blue-500/10 flex items-center justify-center text-blue-400">
              <Lock className="w-6 h-6" />
            </div>
            <p className="font-semibold text-slate-200 text-sm">Direct P2P Encrypted Session</p>
            <p className="text-xs text-slate-400 max-w-sm">
              Send a text message or attach files below. Everything streams directly browser-to-browser.
            </p>
          </div>
        ) : (
          timeline.map((item, idx) => {
            if (item.type === 'chat') {
              const isMe = item.data.sender === 'me';
              return (
                <div
                  key={item.data.id || idx}
                  className={`flex ${isMe ? 'justify-end' : 'justify-start'} animate-in fade-in duration-150`}
                >
                  <div
                    className={`max-w-[85%] sm:max-w-[70%] rounded-2xl px-4 py-2.5 shadow-md space-y-1 ${
                      isMe
                        ? 'bg-blue-600 text-white rounded-br-none'
                        : 'bg-slate-800/90 border border-slate-700/70 text-slate-100 rounded-bl-none'
                    }`}
                  >
                    <p className="text-xs sm:text-sm whitespace-pre-wrap break-words leading-relaxed">
                      {item.data.text}
                    </p>
                    <div
                      className={`text-[10px] text-right ${
                        isMe ? 'text-blue-200' : 'text-slate-400'
                      }`}
                    >
                      {formatTime(item.timestamp)}
                    </div>
                  </div>
                </div>
              );
            }

            // File Item in timeline
            const file = item.data;
            const isMe = file.isLocal;

            return (
              <div
                key={file.id}
                className={`flex ${isMe ? 'justify-end' : 'justify-start'} animate-in fade-in duration-150`}
              >
                <div
                  className={`w-full max-w-[85%] sm:max-w-sm rounded-2xl p-3 shadow-md space-y-2.5 border ${
                    isMe
                      ? 'bg-blue-950/70 border-blue-500/30 text-white rounded-br-none'
                      : 'bg-slate-800/95 border-slate-700 text-slate-100 rounded-bl-none'
                  }`}
                >
                  <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-400">
                    <span>{isMe ? 'You sent a file' : 'Peer sent a file'}</span>
                    <span>•</span>
                    <span>{formatTime(item.timestamp)}</span>
                  </div>

                  {/* File card */}
                  <div className="p-3 bg-slate-950/80 border border-slate-800/80 rounded-xl flex items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2.5 truncate">
                      {getFileIcon(file.mime, file.name)}
                      <div className="truncate">
                        <span className="font-semibold text-slate-200 block truncate" title={file.name}>
                          {file.name}
                        </span>
                        <span className="font-mono text-slate-400 text-[10px]">
                          {formatBytes(file.size)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Action/Progress depending on status */}
                  {file.status === 'transferring' ? (
                    <div className="space-y-1">
                      <div className="flex justify-between text-[11px] font-mono text-slate-400">
                        <span className="flex items-center gap-1.5">
                          <RefreshCw className="w-3 h-3 animate-spin text-emerald-400" />
                          <span>{isMe ? 'Uploading' : 'Downloading'} ({formatSpeed(file.speed)})</span>
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
                    <div className="flex items-center justify-between pt-0.5">
                      <span className="text-[11px] text-emerald-400 font-semibold flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        {isMe ? 'Sent to peer' : 'Downloaded'}
                      </span>
                      {file.url && !isMe && (
                        <a
                          href={file.url}
                          download={file.name}
                          className="px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 text-[11px] font-semibold transition"
                        >
                          Save Again
                        </a>
                      )}
                    </div>
                  ) : !isMe ? (
                    <div className="flex items-center justify-between pt-0.5">
                      <span className="text-[10px] text-slate-400">Ready to transfer</span>
                      <button
                        onClick={() => onDownloadFile(file.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition shadow-md shadow-emerald-500/20 active:scale-95"
                      >
                        <Download className="w-3.5 h-3.5" /> Download
                      </button>
                    </div>
                  ) : (
                    <div className="text-[10px] text-slate-400 flex items-center justify-between">
                      <span className="text-emerald-400">● Live synced to peer</span>
                      <span>Ready</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
        <div ref={chatBottomRef} />
      </div>

      {/* Chat Input Bar */}
      <div className="p-3 sm:p-4 border-t border-slate-800 bg-slate-950/80 backdrop-blur-md flex items-center gap-2 shrink-0">
        <button
          onClick={() => fileInputRef.current?.click()}
          title="Attach Files to Chat"
          className="p-2.5 rounded-xl bg-slate-800/90 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/60 transition active:scale-95 shrink-0"
        >
          <Paperclip className="w-4 h-4 text-blue-400" />
        </button>

        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message to peer..."
          className="flex-1 bg-slate-900 border border-slate-800 focus:border-blue-500 rounded-xl px-4 py-2.5 text-xs sm:text-sm text-white placeholder-slate-500 outline-none transition"
        />

        <button
          onClick={handleSend}
          disabled={!inputText.trim()}
          className="p-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white transition active:scale-95 shrink-0 shadow-md shadow-blue-500/20"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
