"use client";

import { useState } from 'react';
import BidirectionalConnection from '@/components/bidirectional-connection';
import TransferPanel from '@/components/transfer-panel';
import { Button } from '@/components/ui/button';
import { Zap, Lock, ArrowLeftRight, File as FileIcon, UploadCloud } from 'lucide-react';
import { NativeP2PEngine } from '@/lib/webrtc/native-peer';

export default function Home() {
  const [engine, setEngine] = useState<NativeP2PEngine | null>(null);
  const [connectionCode, setConnectionCode] = useState('');
  const [isInitiator, setIsInitiator] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [preSelectedFiles, setPreSelectedFiles] = useState<File[]>([]);

  const handleConnectionEstablished = (
    newEngine: NativeP2PEngine,
    code: string,
    initiator: boolean
  ) => {
    setEngine(newEngine);
    setConnectionCode(code);
    setIsInitiator(initiator);
    setIsConnected(true);
  };

  const handleConnectionLost = () => {
    setEngine(null);
    setConnectionCode('');
    setIsConnected(false);
  };

  const handlePreSelection = (files: FileList) => {
    setPreSelectedFiles(prev => [...prev, ...Array.from(files)]);
  };

  return (
    <div className="flex-1 bg-background flex flex-col text-foreground">
      <main className="flex-1 flex flex-col justify-center">
        {!isConnected ? (
          <div className="container mx-auto px-4 py-8 md:py-12 max-w-2xl space-y-6">
            <div className="text-center space-y-2">
              <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
                Instant Peer File Transfer
              </h1>
              <p className="text-sm sm:text-base text-muted-foreground max-w-lg mx-auto">
                Direct device-to-device browser streaming. Free connection keys, zero accounts, zero file limits, and no middleman servers.
              </p>
            </div>

            {/* Optional Pre-Selected Files Area */}
            <div className="bg-card border rounded-xl p-4 sm:p-5 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Files to Send (Optional)
                </span>
                {preSelectedFiles.length > 0 && (
                  <button
                    onClick={() => setPreSelectedFiles([])}
                    className="text-xs text-destructive hover:underline"
                  >
                    Clear all
                  </button>
                )}
              </div>

              {preSelectedFiles.length > 0 ? (
                <div className="space-y-2">
                  <div className="bg-secondary/40 rounded-lg p-3 max-h-36 overflow-y-auto space-y-1.5 text-xs">
                    {preSelectedFiles.map((file, idx) => (
                      <div key={idx} className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 truncate">
                          <FileIcon className="h-3.5 w-3.5 text-primary shrink-0" />
                          <span className="truncate font-medium">{file.name}</span>
                        </div>
                        <span className="text-muted-foreground font-mono shrink-0">
                          {(file.size / (1024 * 1024)).toFixed(2)} MB
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="relative">
                    <input
                      type="file"
                      multiple
                      className="absolute inset-0 opacity-0 cursor-pointer"
                      onChange={(e) => e.target.files && handlePreSelection(e.target.files)}
                      aria-label="Add more files"
                    />
                    <Button variant="outline" size="sm" className="w-full text-xs">
                      + Add More Files
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="relative group cursor-pointer border border-dashed border-muted-foreground/30 hover:border-primary/60 rounded-lg p-6 text-center transition-colors">
                  <input
                    type="file"
                    multiple
                    className="absolute inset-0 opacity-0 cursor-pointer"
                    onChange={(e) => e.target.files && handlePreSelection(e.target.files)}
                    aria-label="Select files to send"
                  />
                  <UploadCloud className="h-8 w-8 mx-auto text-muted-foreground/60 group-hover:text-primary transition-colors mb-1.5" />
                  <p className="text-xs font-medium">Select files to send</p>
                  <p className="text-[11px] text-muted-foreground">or drag and drop here</p>
                </div>
              )}
            </div>

            {/* Direct WebRTC P2P Connection Box */}
            <BidirectionalConnection
              onConnectionEstablished={handleConnectionEstablished}
              onConnectionLost={handleConnectionLost}
            />

            {/* Lightweight Architectural Guarantees */}
            <div className="grid grid-cols-3 gap-3 pt-2 text-center">
              <div className="p-3 bg-card/60 border rounded-lg space-y-1">
                <Lock className="h-4 w-4 mx-auto text-primary" />
                <p className="text-xs font-semibold">Direct DTLS</p>
                <p className="text-[11px] text-muted-foreground leading-tight">Direct encryption</p>
              </div>
              <div className="p-3 bg-card/60 border rounded-lg space-y-1">
                <Zap className="h-4 w-4 mx-auto text-primary" />
                <p className="text-xs font-semibold">Flow Control</p>
                <p className="text-[11px] text-muted-foreground leading-tight">Backpressure tuned</p>
              </div>
              <div className="p-3 bg-card/60 border rounded-lg space-y-1">
                <ArrowLeftRight className="h-4 w-4 mx-auto text-primary" />
                <p className="text-xs font-semibold">Dual Channel</p>
                <p className="text-[11px] text-muted-foreground leading-tight">Control & raw data</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="container mx-auto px-4 py-6 flex items-center justify-center">
            <TransferPanel
              peer={engine!}
              connectionCode={connectionCode}
              isInitiator={isInitiator}
              initialFiles={preSelectedFiles}
            />
          </div>
        )}
      </main>

      <footer className="border-t py-3 bg-card/40">
        <div className="container mx-auto px-4 text-center text-xs text-muted-foreground">
          FlashTransfer • Free, open, private browser-to-browser data transfer
        </div>
      </footer>
    </div>
  );
}
