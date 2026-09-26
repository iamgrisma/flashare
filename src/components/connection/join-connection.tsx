import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader, KeyRound } from 'lucide-react';

interface JoinConnectionProps {
    inputCode: string;
    setInputCode: (code: string) => void;
    isConnecting: boolean;
    onJoin: () => void;
}

export function JoinConnection({ inputCode, setInputCode, isConnecting, onJoin }: JoinConnectionProps) {
    return (
        <div className="space-y-2">
            <Label htmlFor="join-code" className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <KeyRound className="h-3.5 w-3.5 text-primary" />
                Free Peer Connection Key
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
                <Button onClick={onJoin} disabled={isConnecting || inputCode.length !== 5} className="h-10 px-5">
                    {isConnecting ? <Loader className="animate-spin h-4 w-4" /> : 'Connect'}
                </Button>
            </div>
            <p className="text-[11px] text-muted-foreground text-center">
                100% free & open P2P • No tokens, subscriptions, or credit needed
            </p>
        </div>
    );
}
