"use client";

import { useState, useRef, useCallback, useEffect } from 'react';
import { NativeP2PEngine } from '@/lib/webrtc/native-peer';
import { generateShareCode, obfuscateCode, reverseObfuscateCode } from '@/lib/code';
import { useToast } from '@/hooks/use-toast';
import { ConnectionMode } from '@/lib/types';

export interface UseBidirectionalConnectionProps {
  onConnectionEstablished: (engine: NativeP2PEngine, connectionCode: string, isInitiator: boolean) => void;
  onConnectionLost: () => void;
}

export function useBidirectionalConnection({
  onConnectionEstablished,
  onConnectionLost,
}: UseBidirectionalConnectionProps) {
  const [mode, setMode] = useState<ConnectionMode>('none');
  const [connectionCode, setConnectionCode] = useState('');
  const [inputCode, setInputCode] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remotePeerStatus, setRemotePeerStatus] = useState<'online' | 'offline' | 'left'>('offline');

  const engineRef = useRef<NativeP2PEngine | null>(null);
  const shareIdRef = useRef<string | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const processedCandidatesRef = useRef<Set<string>>(new Set());
  const { toast } = useToast();

  const stopPolling = () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  };

  const handleDisconnect = useCallback(() => {
    stopPolling();
    processedCandidatesRef.current.clear();
    if (shareIdRef.current) {
      fetch('/api/signaling/exchange', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'close', id: shareIdRef.current }),
      }).catch(() => {});
    }
    if (engineRef.current) {
      engineRef.current.close();
      engineRef.current = null;
    }
    setIsConnected(false);
    setIsConnecting(false);
    setMode('none');
    setConnectionCode('');
    setError(null);
    setRemotePeerStatus('offline');
    onConnectionLost();
  }, [onConnectionLost]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopPolling();
      if (engineRef.current && !isConnected) {
        engineRef.current.close();
      }
    };
  }, [isConnected]);

  /**
   * HOST / CREATOR FLOW:
   * Generates offer and listens for answer via ephemeral in-memory exchange API
   */
  const createConnection = useCallback(
    async (isResume: boolean = false) => {
      setIsConnecting(true);
      setError(null);
      stopPolling();
      processedCandidatesRef.current.clear();

      try {
        const shortCode = isResume && connectionCode ? reverseObfuscateCode(connectionCode) : generateShareCode();
        const obfuscated = isResume && connectionCode ? connectionCode : obfuscateCode(shortCode);

        const engine = new NativeP2PEngine();
        engineRef.current = engine;
        const pc = engine.init(true);

        const iceCandidates: RTCIceCandidateInit[] = [];

        engine.setCallbacks({
          onControl: () => {},
          onData: () => {},
          onState: (state) => {
            if (state === 'connected') {
              stopPolling();
              setIsConnected(true);
              setIsConnecting(false);
              setRemotePeerStatus('online');
              toast({ title: 'Connected!', description: 'WebRTC P2P direct data channel ready' });
              onConnectionEstablished(engine, obfuscated, true);
            } else if (state === 'disconnected' || state === 'failed' || state === 'closed') {
              setIsConnected(false);
              setRemotePeerStatus('offline');
              onConnectionLost();
            }
          },
          onTrickleCandidate: (candidate) => {
            const candJson = candidate.toJSON();
            iceCandidates.push(candJson);
            if (shareIdRef.current) {
              fetch('/api/signaling/exchange', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  action: 'add-candidate',
                  id: shareIdRef.current,
                  candidate: candJson,
                  fromHost: true,
                }),
              }).catch(() => {});
            }
          },
        });

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        // Post offer to in-memory signaling exchange
        const res = await fetch('/api/signaling/exchange', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'create',
            shortCode,
            sdp: offer,
          }),
        });
        const data = await res.json();
        if (!data.success) {
          throw new Error(data.error || 'Failed to initialize session');
        }

        shareIdRef.current = data.id;
        setConnectionCode(obfuscated);
        setMode('create');

        // Post any early candidates
        for (const cand of iceCandidates) {
          fetch('/api/signaling/exchange', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'add-candidate',
              id: data.id,
              candidate: cand,
              fromHost: true,
            }),
          }).catch(() => {});
        }

        // Fast in-memory polling (600ms) for answer and peer candidates
        pollIntervalRef.current = setInterval(async () => {
          if (!engine.pc || engine.isConnected) return;
          try {
            const checkRes = await fetch('/api/signaling/exchange', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'get', id: data.id }),
            });
            const checkData = await checkRes.json();
            if (checkData.success && checkData.session) {
              const session = checkData.session;

              // Apply remote answer once
              if (session.answer && !engine.pc.remoteDescription) {
                try {
                  await engine.pc.setRemoteDescription(new RTCSessionDescription(session.answer));
                } catch (e) {
                  console.error('Failed to set remote answer:', e);
                }
              }

              // Apply any trickle peer candidates after remote description is set
              if (engine.pc.remoteDescription && session.peerCandidates && Array.isArray(session.peerCandidates)) {
                for (const cand of session.peerCandidates) {
                  const key = JSON.stringify(cand);
                  if (!processedCandidatesRef.current.has(key)) {
                    try {
                      await engine.pc.addIceCandidate(new RTCIceCandidate(cand));
                      processedCandidatesRef.current.add(key);
                    } catch {}
                  }
                }
              }
            }
          } catch {}
        }, 600);
      } catch (err: any) {
        console.error('Create connection error:', err);
        setError(err.message || 'Failed to create connection');
        setIsConnecting(false);
      }
    },
    [connectionCode, onConnectionEstablished, onConnectionLost, toast]
  );

  /**
   * JOINER / CLIENT FLOW:
   * Fetches offer from in-memory exchange, sets remote description, generates answer, sends to host
   */
  const joinConnection = useCallback(
    async (codeOverride?: string) => {
      const codeToUse = (codeOverride || inputCode).trim().toLowerCase();
      if (!codeToUse || codeToUse.length !== 5) {
        setError('Please enter a valid 5-character code');
        return;
      }

      setIsConnecting(true);
      setError(null);
      stopPolling();
      processedCandidatesRef.current.clear();

      try {
        const shortCode = reverseObfuscateCode(codeToUse);

        // Fetch offer from in-memory exchange
        const res = await fetch('/api/signaling/exchange', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'get', shortCode }),
        });
        const data = await res.json();
        if (!data.success || !data.session?.offer) {
          throw new Error('Connection code not found or expired');
        }

        const session = data.session;
        shareIdRef.current = session.id;

        const engine = new NativeP2PEngine();
        engineRef.current = engine;
        const pc = engine.init(false);

        engine.setCallbacks({
          onControl: () => {},
          onData: () => {},
          onState: (state) => {
            if (state === 'connected') {
              stopPolling();
              setIsConnected(true);
              setIsConnecting(false);
              setRemotePeerStatus('online');
              setConnectionCode(codeToUse);
              setMode('join');
              toast({ title: 'Connected!', description: 'WebRTC P2P direct data channel ready' });
              onConnectionEstablished(engine, codeToUse, false);
            } else if (state === 'disconnected' || state === 'failed' || state === 'closed') {
              setIsConnected(false);
              setRemotePeerStatus('offline');
              onConnectionLost();
            }
          },
          onTrickleCandidate: (candidate) => {
            fetch('/api/signaling/exchange', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                action: 'add-candidate',
                id: session.id,
                candidate: candidate.toJSON(),
                fromHost: false,
              }),
            }).catch(() => {});
          },
        });

        await pc.setRemoteDescription(new RTCSessionDescription(session.offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        // Add any host candidates already present
        if (session.hostCandidates && Array.isArray(session.hostCandidates)) {
          for (const cand of session.hostCandidates) {
            const key = JSON.stringify(cand);
            if (!processedCandidatesRef.current.has(key)) {
              processedCandidatesRef.current.add(key);
              try {
                await pc.addIceCandidate(new RTCIceCandidate(cand));
              } catch {}
            }
          }
        }

        // Send answer to exchange
        await fetch('/api/signaling/exchange', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'answer',
            id: session.id,
            sdp: answer,
          }),
        });

        // Fast poll for any additional host trickle candidates
        pollIntervalRef.current = setInterval(async () => {
          if (!engine.pc || engine.isConnected) return;
          try {
            const checkRes = await fetch('/api/signaling/exchange', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'get', id: session.id }),
            });
            const checkData = await checkRes.json();
            if (checkData.success && checkData.session?.hostCandidates) {
              for (const cand of checkData.session.hostCandidates) {
                const key = JSON.stringify(cand);
                if (!processedCandidatesRef.current.has(key)) {
                  try {
                    await engine.pc?.addIceCandidate(new RTCIceCandidate(cand));
                    processedCandidatesRef.current.add(key);
                  } catch {}
                }
              }
            }
          } catch {}
        }, 600);
      } catch (err: any) {
        console.error('Join error:', err);
        setError(err.message || 'Failed to join connection');
        setIsConnecting(false);
      }
    },
    [inputCode, onConnectionEstablished, onConnectionLost, toast]
  );

  return {
    mode,
    connectionCode,
    inputCode,
    setInputCode,
    isConnecting,
    isConnected,
    error,
    remotePeerStatus,
    createConnection,
    joinConnection,
    handleDisconnect,
    handleRotateSession: () => createConnection(false),
  };
}
