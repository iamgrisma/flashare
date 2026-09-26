import React, { useState } from 'react';
import { X, ShieldCheck, FileText, Lock, EyeOff, ServerOff, Cpu } from 'lucide-react';

interface LegalModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'privacy' | 'terms';
}

export function LegalModal({ isOpen, onClose, initialTab = 'privacy' }: LegalModalProps) {
  const [activeTab, setActiveTab] = useState<'privacy' | 'terms'>(initialTab);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl max-h-[85vh] rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-400">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Legal & Architecture</h2>
              <p className="text-xs text-slate-400">Decentralized, zero-knowledge, pure P2P</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Tabs */}
            <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs font-medium">
              <button
                onClick={() => setActiveTab('privacy')}
                className={`px-3 py-1 rounded-lg transition ${
                  activeTab === 'privacy' ? 'bg-blue-600 text-white font-semibold' : 'text-slate-400 hover:text-white'
                }`}
              >
                Privacy Policy
              </button>
              <button
                onClick={() => setActiveTab('terms')}
                className={`px-3 py-1 rounded-lg transition ${
                  activeTab === 'terms' ? 'bg-blue-600 text-white font-semibold' : 'text-slate-400 hover:text-white'
                }`}
              >
                Terms of Service
              </button>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-full bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition ml-2"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content body */}
        <div className="p-6 overflow-y-auto space-y-6 text-slate-300 text-xs sm:text-sm leading-relaxed">
          {activeTab === 'privacy' ? (
            <div className="space-y-5">
              <div className="p-4 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-300 space-y-1">
                <span className="font-bold flex items-center gap-1.5 text-blue-200">
                  <Lock className="w-4 h-4 text-blue-400" /> Pure Peer-to-Peer Architecture (Zero Storage)
                </span>
                <p className="text-xs text-blue-300/90 leading-normal">
                  FlashTransfer does not operate storage servers, databases, or cloud disks. Data flows directly from one browser to another browser over encrypted WebRTC DataChannels.
                </p>
              </div>

              <div className="space-y-2">
                <h3 className="font-bold text-white text-sm flex items-center gap-2">
                  <ServerOff className="w-4 h-4 text-emerald-400" />
                  1. Zero Server Storage of Files
                </h3>
                <p className="text-slate-400 text-xs">
                  Files shared through FlashTransfer are sliced into memory chunks in your browser and transferred directly to the connected peer device. No files or media are ever uploaded to, cached on, or processed by our servers, Cloudflare Pages, or third-party storage. Once both devices disconnect, the memory buffers cease to exist.
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
                  WebRTC requires initial signaling (via PeerJS brokers and public STUN servers such as Google and Cloudflare) solely to exchange connection parameters (SDP offers and ICE candidates) to negotiate NAT traversal. Once the direct peer connection opens, all payload data (files, text messages, manifests) moves exclusively between the two peers and never touches signaling infrastructure.
                </p>
              </div>

              <div className="space-y-2">
                <h3 className="font-bold text-white text-sm flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-rose-400" />
                  4. No Accounts, Cookies, or Tracking
                </h3>
                <p className="text-slate-400 text-xs">
                  FlashTransfer requires no registration, logins, email addresses, or phone numbers. We do not set tracking cookies, run behavioral analytics, or collect identifiable metadata.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="space-y-2">
                <h3 className="font-bold text-white text-sm">1. Acceptance of Terms</h3>
                <p className="text-slate-400 text-xs">
                  By using FlashTransfer, you agree to these Terms of Service. FlashTransfer provides decentralized, browser-to-browser peer-to-peer file transfer utility.
                </p>
              </div>

              <div className="space-y-2">
                <h3 className="font-bold text-white text-sm">2. Permitted Use</h3>
                <p className="text-slate-400 text-xs">
                  You agree to use this software in compliance with all applicable local, national, and international laws. You may not use the service to transmit malware, pirated material, or harmful files.
                </p>
              </div>

              <div className="space-y-2">
                <h3 className="font-bold text-white text-sm">3. Peer-to-Peer Responsibility</h3>
                <p className="text-slate-400 text-xs">
                  Because FlashTransfer is a peer-to-peer application without server storage, you alone control with whom you share your room codes and QR codes. Only share connection codes with trusted parties.
                </p>
              </div>

              <div className="space-y-2">
                <h3 className="font-bold text-white text-sm">4. Disclaimer of Warranty</h3>
                <p className="text-slate-400 text-xs">
                  FlashTransfer is provided &quot;AS IS&quot; without warranties of any kind, either express or implied. The developers shall not be liable for any data loss, transfer interruption, or damages resulting from the use of this software.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between text-xs text-slate-400 shrink-0">
          <span>FlashTransfer • Pure Peer to Peer</span>
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
