"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader, Wifi, WifiOff, Link2 } from 'lucide-react';
import { useBidirectionalConnection } from '@/components/connection/use-connection';
import { CreateConnection } from '@/components/connection/create-connection';
import { JoinConnection } from '@/components/connection/join-connection';
import { ActiveConnection } from '@/components/connection/active-connection';
import { useEffect } from 'react';
import { NativeP2PEngine } from '@/lib/webrtc/native-peer';

interface BidirectionalConnectionProps {
    onConnectionEstablished: (engine: NativeP2PEngine, connectionCode: string, isInitiator: boolean) => void;
    onConnectionLost: () => void;
    targetCode?: string | null; // Code to auto-join
}

export default function BidirectionalConnection({
    onConnectionEstablished,
    onConnectionLost,
    targetCode
}: BidirectionalConnectionProps) {
    const {
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
        handleRotateSession
    } = useBidirectionalConnection({ onConnectionEstablished, onConnectionLost });

    // Auto-join if targetCode is provided
    useEffect(() => {
        if (targetCode && !isConnected && !isConnecting && mode === 'none') {
            joinConnection(targetCode);
        }
    }, [targetCode, isConnected, isConnecting, mode, joinConnection]);

    return (
        <Card className="w-full max-w-lg mx-auto">
            <CardHeader className="p-4 sm:p-6">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                    <div className="flex-1 min-w-0">
                        <CardTitle className="font-headline text-base sm:text-lg md:text-xl break-words">Bidirectional P2P Connection</CardTitle>
                        <CardDescription className="text-xs sm:text-sm mt-1">
                            {isConnected ? 'Connected - You can now send and receive files' : 'Create or join a connection'}
                        </CardDescription>
                    </div>
                    <Badge variant={isConnected ? 'default' : 'secondary'} className="flex items-center gap-1.5 text-xs shrink-0">
                        {isConnected ? <Wifi className="w-3 h-3 text-green-400" /> : <WifiOff className="w-3 h-3 text-gray-400" />}
                        {isConnected ? 'Connected' : 'Disconnected'}
                    </Badge>
                </div>
            </CardHeader>
            <CardContent className="space-y-4 p-4 sm:p-6">
                {!isConnected && mode === 'none' && (
                    <div className="space-y-3">
                        <Button
                            onClick={() => createConnection(false)}
                            disabled={isConnecting}
                            className="w-full"
                            size="lg"
                        >
                            {isConnecting ? <Loader className="mr-2 animate-spin" /> : <Link2 className="mr-2" />}
                            Create New Connection
                        </Button>

                        <div className="relative">
                            <div className="absolute inset-0 flex items-center">
                                <span className="w-full border-t" />
                            </div>
                            <div className="relative flex justify-center text-xs uppercase">
                                <span className="bg-background px-2 text-muted-foreground">Or</span>
                            </div>
                        </div>

                        <JoinConnection
                            inputCode={inputCode}
                            setInputCode={setInputCode}
                            isConnecting={isConnecting}
                            onJoin={joinConnection}
                        />
                    </div>
                )}

                {!isConnected && mode === 'create' && connectionCode && (
                    <CreateConnection
                        connectionCode={connectionCode}
                        isConnecting={isConnecting}
                        onDisconnect={handleDisconnect}
                    />
                )}

                {isConnected && (
                    <ActiveConnection
                        connectionCode={connectionCode}
                        remotePeerStatus={remotePeerStatus}
                        onDisconnect={handleDisconnect}
                        onRotateSession={handleRotateSession}
                        isHost={mode === 'create'}
                    />
                )}

                {error && (
                    <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md">
                        {error}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
