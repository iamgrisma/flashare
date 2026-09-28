import { useState, useEffect } from 'react';
import { X, ShieldCheck, Lock, EyeOff, ServerOff, Cpu, Info, FileText } from 'lucide-react';

interface LegalModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'about' | 'privacy' | 'terms';
}

export function LegalModal({ isOpen, onClose, initialTab = 'about' }: LegalModalProps) {
  const [activeTab, setActiveTab] = useState<'about' | 'privacy' | 'terms'>(initialTab);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl max-h-[85vh] rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-400">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-white">FlaShare Information</h2>
              <p className="text-[11px] text-slate-400">Pure P2P, zero-knowledge, encrypted</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Tabs */}
            <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs font-medium">
              <button
                onClick={() => setActiveTab('about')}
                className={`px-2.5 py-1 rounded-lg transition ${
                  activeTab === 'about' ? 'bg-blue-600 text-white font-semibold' : 'text-slate-400 hover:text-white'
                }`}
              >
                About
              </button>
              <button
                onClick={() => setActiveTab('privacy')}
                className={`px-2.5 py-1 rounded-lg transition ${
                  activeTab === 'privacy' ? 'bg-blue-600 text-white font-semibold' : 'text-slate-400 hover:text-white'
                }`}
              >
                Privacy
              </button>
              <button
                onClick={() => setActiveTab('terms')}
                className={`px-2.5 py-1 rounded-lg transition ${
                  activeTab === 'terms' ? 'bg-blue-600 text-white font-semibold' : 'text-slate-400 hover:text-white'
                }`}
              >
                Terms
              </button>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-full bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition ml-1"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-6 text-slate-300 text-xs sm:text-sm leading-relaxed">
          {activeTab === 'about' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-300 space-y-1">
                <span className="font-bold flex items-center gap-1.5 text-blue-200">
                  <Info className="w-4 h-4 text-blue-400" /> About FlaShare
                </span>
                <p className="text-xs text-blue-300/90 leading-normal">
                  FlaShare is an ultra-fast, zero-cloud peer-to-peer file transfer and communication tool engineered for high speed, absolute privacy, and cross-platform flexibility.
                </p>
              </div>

              <div className="space-y-2">
                <h3 className="font-bold text-white text-sm flex items-center gap-2">
                  <Lock className="w-4 h-4 text-emerald-400" />
                  Direct Browser-to-Browser WebRTC
                </h3>
                <p className="text-slate-400 text-xs leading-relaxed">
                  Unlike traditional cloud storage or messaging platforms that require uploading your files to intermediary servers, FlaShare creates a direct, encrypted tunnel between your device and the recipient device. Files stream directly across memory buffers with zero server involvement.
                </p>
              </div>

              <div className="space-y-2">
                <h3 className="font-bold text-white text-sm flex items-center gap-2">
                  <ServerOff className="w-4 h-4 text-purple-400" />
                  No File Size Limits &amp; Zero Accounts
                </h3>
                <p className="text-slate-400 text-xs leading-relaxed">
                  Share large documents, high-resolution media, datasets, and archives without artificial file size caps or registration requirements. Connect via a 5-digit room code or QR code scan and begin transferring instantly.
                </p>
              </div>

              <div className="space-y-2">
                <h3 className="font-bold text-white text-sm flex items-center gap-2">
                  <FileText className="w-4 h-4 text-amber-400" />
                  Part of TopNepali Network
                </h3>
                <p className="text-slate-400 text-xs leading-relaxed">
                  FlaShare is proudly part of the TopNepali digital ecosystem. For feedback, inquiries, or security disclosures, reach out to <a href="mailto:share@topnepali.com" className="text-blue-400 hover:underline font-semibold">share@topnepali.com</a>.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'privacy' && (
            <div className="space-y-5">
              <div className="p-4 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-300 space-y-1">
                <span className="font-bold flex items-center gap-1.5 text-blue-200">
                  <Lock className="w-4 h-4 text-blue-400" /> Pure Peer-to-Peer Architecture (Zero Storage)
                </span>
                <p className="text-xs text-blue-300/90 leading-normal">
                  FlaShare does not operate storage servers, databases, or cloud disks. Data flows directly from one browser to another browser over encrypted WebRTC DataChannels.
                </p>
              </div>

              <div className="space-y-2">
                <h3 className="font-bold text-white text-sm flex items-center gap-2">
                  <ServerOff className="w-4 h-4 text-emerald-400" />
                  1. Zero Server Storage of Files
                </h3>
                <p className="text-slate-400 text-xs">
                  Files shared through FlaShare are sliced into memory chunks in your browser and transferred directly to the connected peer device. No files or media are ever uploaded to, cached on, or processed by our servers, Cloudflare Pages, or third-party storage. Once both devices disconnect, the memory buffers cease to exist.
                </p>
              </div>

              <div className="space-y-2">
                <h3 className="font-bold text-white text-sm flex items-center gap-2">
                  <EyeOff className="w-4 h-4 text-purple-400" />
                  2. Ephemeral Chat & Immediate Data Wipe
                </h3>
                <p className="text-slate-400 text-xs">
                  The in-app chat is strictly ephemeral. Messages are transmitted directly peer-to-peer and exist only in transient JavaScript RAM. We do not store chat logs, IP addresses, or conversation histories. The instant either device disconnects or refreshes the page, all chat messages are permanently and irretrievably destroyed.
                </p>
              </div>

              <div className="space-y-2">
                <h3 className="font-bold text-white text-sm flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-amber-400" />
                  3. Signaling & STUN Traversal
                </h3>
                <p className="text-slate-400 text-xs">
                  WebRTC requires initial signaling (via ephemeral Redis mailbox and public STUN servers such as Google and Cloudflare) solely to exchange connection parameters (SDP offers and ICE candidates) to negotiate NAT traversal. Once the direct peer connection opens, all payload data (files, text messages, manifests) moves exclusively between the two peers and never touches signaling infrastructure.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'terms' && (
            <div className="space-y-5">
              <div className="space-y-2">
                <h3 className="font-bold text-white text-sm">1. Terms of Use</h3>
                <p className="text-slate-400 text-xs">
                  By accessing and using FlaShare, you agree to comply with all applicable local, national, and international laws. You are solely responsible for all content, files, and communications transmitted through your browser connection.
                </p>
              </div>

              <div className="space-y-2">
                <h3 className="font-bold text-white text-sm">2. Prohibited Content</h3>
                <p className="text-slate-400 text-xs">
                  You agree never to use FlaShare to transmit malicious software, malware, copyrighted material without authorization, child exploitation material, harassment, or any materials violating applicable laws.
                </p>
              </div>

              <div className="space-y-2">
                <h3 className="font-bold text-white text-sm">3. Peer-to-Peer Responsibility</h3>
                <p className="text-slate-400 text-xs">
                  Because FlaShare is a peer-to-peer application without server storage, you alone control with whom you share your room codes and QR codes. Only share connection codes with trusted parties.
                </p>
              </div>

              <div className="space-y-2">
                <h3 className="font-bold text-white text-sm">4. Disclaimer of Warranty</h3>
                <p className="text-slate-400 text-xs">
                  FlaShare is provided &quot;AS IS&quot; without warranties of any kind, either express or implied. The developers shall not be liable for any data loss, transfer interruption, or damages resulting from the use of this software.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between text-xs text-slate-400 shrink-0">
          <span>FlaShare • Pure Peer to Peer</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
