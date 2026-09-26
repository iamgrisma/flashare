import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader, Copy, Check, QrCode } from 'lucide-react';
import QRCode from 'qrcode.react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';

interface CreateConnectionProps {
    connectionCode: string;
    isConnecting: boolean;
    onDisconnect: () => void;
}

export function CreateConnection({ connectionCode, isConnecting, onDisconnect }: CreateConnectionProps) {
    const [hasCopied, setHasCopied] = useState(false);
    const { toast } = useToast();

    const handleCopy = async (text: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setHasCopied(true);
            toast({ title: 'Copied!', description: 'Connection key copied to clipboard' });
            setTimeout(() => setHasCopied(false), 2000);
        } catch (err) {
            toast({ title: 'Failed to copy', variant: 'destructive' });
        }
    };

    const shareLink = connectionCode ? `${typeof window !== 'undefined' ? window.location.origin : ''}/s/${connectionCode}` : '';

    return (
        <div className="space-y-4 animate-in fade-in">
            <div className="text-center p-4 bg-secondary/50 rounded-lg">
                <Loader className="mx-auto h-7 w-7 animate-spin text-primary mb-2" />
                <p className="text-sm font-medium">Waiting for peer to connect...</p>
                <p className="text-xs text-muted-foreground mt-1">Direct P2P session • Free, unlimited & private</p>
            </div>

            <div className="space-y-2">
                <div className="flex justify-between items-center">
                    <Label className="text-xs font-medium text-muted-foreground">Your Free Connection Key</Label>
                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">Instant & Free</span>
                </div>
                <div className="flex gap-2">
                    <Input
                        value={connectionCode}
                        readOnly
                        className="text-center text-2xl tracking-[0.3em] font-mono font-bold"
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
                <Button onClick={() => handleCopy(shareLink)} variant="outline" className="flex-1 text-xs">
                    <Copy className="mr-2 h-3.5 w-3.5" /> Copy Direct Link
                </Button>

                <Dialog>
                    <DialogTrigger asChild>
                        <Button variant="outline" className="text-xs">
                            <QrCode className="mr-1.5 h-3.5 w-3.5" /> QR Code
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-xs">
                        <DialogHeader>
                            <DialogTitle className="text-base text-center">Scan with Phone Camera</DialogTitle>
                        </DialogHeader>
                        <div className="flex items-center justify-center p-4 bg-white rounded-lg">
                            <QRCode value={shareLink} size={200} />
                        </div>
                        <p className="text-xs text-center text-muted-foreground">
                            Opens direct P2P receiver in browser instantly
                        </p>
                    </DialogContent>
                </Dialog>
            </div>

            <Button onClick={onDisconnect} variant="ghost" className="w-full text-xs text-muted-foreground">
                Cancel Session
            </Button>
        </div>
    );
}
