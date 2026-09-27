import {
  File as FileIcon,
  Image as ImageIcon,
  Film,
  Music,
  Archive,
  FileText,
} from 'lucide-react';

export function formatTime(ts?: number): string {
  if (!ts) return '';
  const date = new Date(ts);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function getFileIcon(mime: string, name: string) {
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
