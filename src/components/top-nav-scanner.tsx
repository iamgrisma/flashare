"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Camera } from 'lucide-react';
import { QrScannerDialog } from '@/components/connection/qr-scanner-dialog';
import { useToast } from '@/hooks/use-toast';

export function TopNavScanner() {
    const [isOpen, setIsOpen] = useState(false);
    const router = useRouter();
    const { toast } = useToast();

    const handleScanSuccess = (scannedCode: string) => {
        toast({
            title: 'QR Code Detected!',
            description: `Connecting to transfer session ${scannedCode.toUpperCase()}...`,
        });
        // Route directly to the session receiver page
        router.push(`/s/${scannedCode}`);
    };

    return (
        <>
            <Button
                variant="outline"
                size="sm"
                onClick={() => setIsOpen(true)}
                className="h-9 text-xs flex items-center gap-1.5 border-border hover:border-primary hover:text-primary transition-colors"
                title="Scan Transfer QR Code"
            >
                <Camera className="h-4 w-4 text-primary" />
                <span className="font-medium">Scan QR</span>
            </Button>

            <QrScannerDialog
                open={isOpen}
                onOpenChange={setIsOpen}
                onScanSuccess={handleScanSuccess}
            />
        </>
    );
}
