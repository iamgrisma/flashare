import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader, KeyRound, QrCode } from 'lucide-react';
import { QrScannerDialog } from '@/components/connection/qr-scanner-dialog';
import { useToast } from '@/hooks/use-toast';

interface JoinConnectionProps {
    inputCode: string;
    setInputCode: (code: string) => void;
    isConnecting: boolean;
    onJoin: (codeOverride?: string) => void;
}

export function JoinConnection({ inputCode, setInputCode, isConnecting, onJoin }: JoinConnectionProps) {
    const [isScannerOpen, setIsScannerOpen] = useState(false);
    const { toast } = useToast();

    const handleScanSuccess = (scannedCode: string) => {
        setInputCode(scannedCode);
        toast({
            title: 'QR Code Scanned!',
            description: `Connecting with key ${scannedCode.toUpperCase()}...`,
        });
        // Auto-join with scanned code
        setTimeout(() => {
            onJoin(scannedCode);
        }, 100);
    };

    return (
        <div className="space-y-3">
            <Label htmlFor="join-code" className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <KeyRound className="h-3.5 w-3.5 text-primary" />
                Peer Connection Key
            </Label>

            <div className="flex gap-2">
                <Input
                    id="join-code"
                    placeholder="e.g. 7k9m2"
                    value={inputCode}
                    onChange={(e) => setInputCode(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ''))}
                    maxLength={5}
                    className="text-center text-lg tracking-widest font-mono uppercase h-10"
                />
                <Button
                    onClick={() => onJoin()}
                    disabled={isConnecting || inputCode.length !== 5}
                    className="h-10 px-5 shrink-0"
                >
                    {isConnecting ? <Loader className="animate-spin h-4 w-4" /> : 'Connect'}
                </Button>
            </div>

            <Button
                type="button"
                variant="outline"
                onClick={() => setIsScannerOpen(true)}
                className="w-full h-9 text-xs border-dashed hover:border-primary hover:text-primary transition-colors flex items-center justify-center gap-2"
            >
                <QrCode className="h-4 w-4 text-primary" />
                <span>Scan QR Code to Join Session</span>
            </Button>

            <p className="text-[11px] text-muted-foreground text-center">
                100% free & open P2P • No tokens, subscriptions, or credit needed
            </p>

            <QrScannerDialog
                open={isScannerOpen}
                onOpenChange={setIsScannerOpen}
                onScanSuccess={handleScanSuccess}
            />
        </div>
    );
}
