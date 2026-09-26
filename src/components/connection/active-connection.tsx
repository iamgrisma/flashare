import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Wifi, Copy, Check, RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface ActiveConnectionProps {
    connectionCode: string;
    remotePeerStatus: 'online' | 'offline' | 'left';
    onDisconnect: () => void;
    onRotateSession?: () => void;
    isHost: boolean;
}

export function ActiveConnection({
    connectionCode,
    remotePeerStatus,
    onDisconnect,
    onRotateSession,
    isHost
}: ActiveConnectionProps) {
    const [hasCopied, setHasCopied] = useState(false);
    const { toast } = useToast();

    useEffect(() => {
        if (hasCopied) {
            const timeout = setTimeout(() => {
                setHasCopied(false);
            }, 2000);
            return () => clearTimeout(timeout);
        }
    }, [hasCopied]);

    const handleCopy = async (text: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setHasCopied(true);
            toast({ title: 'Copied!', description: 'Connection key copied to clipboard' });
        } catch (err) {
            toast({ title: 'Failed to copy', variant: 'destructive' });
        }
    };

    return (
        <div className="space-y-4 animate-in fade-in">
            <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-center">
                <Wifi className="mx-auto h-7 w-7 text-emerald-500 mb-2" />
                <p className="font-semibold text-emerald-700 dark:text-emerald-400">P2P Channel Active</p>
                <div className="flex items-center justify-center gap-2 mt-1">
                    <span className={`h-2 w-2 rounded-full ${remotePeerStatus === 'online' ? 'bg-emerald-500 animate-pulse' : 'bg-yellow-500'}`} />
                    <p className="text-xs text-muted-foreground capitalize">Peer {remotePeerStatus} • Encrypted & Direct</p>
                </div>
            </div>

            <div className="space-y-2">
                <Label className="text-xs font-medium text-muted-foreground">Active Connection Key</Label>
                <div className="flex gap-2">
                    <Input
                        value={connectionCode}
                        readOnly
                        className="text-center text-xl tracking-widest font-mono font-bold"
                    />
                    <Button
                        onClick={() => handleCopy(connectionCode)}
                        size="icon"
                        variant="outline"
                        aria-label="Copy connection key"
                    >
                        {hasCopied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                    </Button>
                </div>
            </div>

            <div className="flex gap-2">
                <Button onClick={onDisconnect} variant="outline" className="flex-1 text-xs">
                    Disconnect
                </Button>

                {isHost && onRotateSession && (
                    <Button onClick={onRotateSession} variant="secondary" className="flex-1 text-xs">
                        <RefreshCw className="h-3.5 w-3.5 mr-1" /> New Key
                    </Button>
                )}
            </div>
        </div>
    );
}
