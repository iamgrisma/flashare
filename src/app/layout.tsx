import type { Metadata } from 'next';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';
import { Send } from 'lucide-react';
import GlobalPolyfills from '@/components/global-polyfills';

export const metadata: Metadata = {
  title: 'FlashTransfer - Secure Peer-to-Peer File Sharing',
  description: 'Secure, Private, Peer-to-Peer File Sharing',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Lexend:wght@400;700&display=swap" rel="stylesheet" />
      </head>
      <body className="font-body antialiased flex flex-col min-h-screen" suppressHydrationWarning>
        <header className="w-full p-4 md:p-6 border-b">
          <div className="container mx-auto flex items-center justify-between">
            <a href="/" className="flex items-center gap-3">
              <Send className="text-primary h-7 w-7" />
              <h1 className="text-2xl font-bold font-headline text-foreground">FileZen</h1>
            </a>
          </div>
        </header>
        {children}
        <Toaster />
        <footer className="w-full bg-background border-t mt-auto py-12">
          <div className="container mx-auto text-center text-muted-foreground text-sm">
            <div className="flex flex-col md:flex-row justify-between gap-8">
              <div className="text-left">
                <div className="flex items-center gap-3 mb-2">
                  <Send className="text-primary h-6 w-6" />
                  <h2 className="text-xl font-bold font-headline text-foreground">FileZen</h2>
                </div>
                <p className="max-w-md">Secure, private, and fast peer-to-peer file sharing. Your files are never uploaded to a server.</p>
              </div>
              <div className="text-left">
                <h3 className="font-semibold text-foreground mb-3">Privacy & Security</h3>
                <p className="max-w-md">
                  FileZen is a serverless application. We do not store your files, monitor your transfers, or keep any logs. All transfers are done directly between your browser and the recipient's browser using an encrypted WebRTC connection.
                </p>
              </div>
              <div className="text-left">
                <h3 className="font-semibold text-foreground mb-3">Disclaimer</h3>
                <p className="max-w-md">
                  This service is provided "as is", without warranty of any kind. You are responsible for the files you share. Only share files with people you trust and ensure you are not violating any copyrights or local laws.
                </p>
              </div>
            </div>
            <div className="border-t mt-8 pt-6">
              <p>&copy; {new Date().getFullYear()} FileZen. All Rights Reserved.</p>
            </div>
          </div>
        </footer>
        <GlobalPolyfills />
      </body>
    </html>
  );
}
