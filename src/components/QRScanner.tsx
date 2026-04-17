'use client';

import { useEffect, useRef, useState } from 'react';

export interface QRScannerProps {
  /** Callback fired when a QR code is successfully scanned */
  onScan: (decodedText: string) => void;
  /** Callback fired when an error occurs during scanning */
  onError?: (error: string) => void;
}

/**
 * Camera-based QR scanner using html5-qrcode.
 * Initializes the scanner on mount and cleans up on unmount.
 * Must be dynamically imported with ssr: false since html5-qrcode
 * requires browser APIs (navigator.mediaDevices).
 *
 * @see Requirements 7.4 (scan QR and parse), 7.5 (error for malformed QR),
 *      7.6 (validate Stellar address)
 */
export function QRScanner({ onScan, onError }: QRScannerProps) {
  const scannerRef = useRef<HTMLDivElement>(null);
  const html5QrScannerRef = useRef<unknown>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [scanError, setScanError] = useState('');

  useEffect(() => {
    let mounted = true;

    async function initScanner() {
      try {
        const { Html5QrcodeScanner } = await import('html5-qrcode');

        if (!mounted || !scannerRef.current) return;

        const scanner = new Html5QrcodeScanner(
          'qr-reader',
          {
            fps: 10,
            qrbox: { width: 250, height: 250 },
            rememberLastUsedCamera: true,
          },
          /* verbose= */ false,
        );

        html5QrScannerRef.current = scanner;

        scanner.render(
          (decodedText: string) => {
            // Success callback — stop scanning and notify parent
            onScan(decodedText);
            scanner.clear().catch(() => {
              // Ignore cleanup errors
            });
          },
          (errorMessage: string) => {
            // This fires on every failed scan attempt (e.g. no QR in frame).
            // Only surface meaningful errors, not frame-by-frame scan misses.
            if (errorMessage.includes('No MultiFormat Readers')) return;
            if (errorMessage.includes('NotFoundException')) return;
          },
        );

        if (mounted) {
          setIsInitializing(false);
        }
      } catch (err) {
        if (mounted) {
          const message = err instanceof Error ? err.message : 'Failed to initialize camera';
          setScanError(message);
          setIsInitializing(false);
          onError?.(message);
        }
      }
    }

    initScanner();

    return () => {
      mounted = false;
      // Clean up scanner on unmount
      const scanner = html5QrScannerRef.current as { clear?: () => Promise<void> } | null;
      if (scanner?.clear) {
        scanner.clear().catch(() => {
          // Ignore cleanup errors
        });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="w-full">
      {isInitializing && (
        <div className="flex items-center justify-center py-12">
          <div className="flex flex-col items-center gap-2">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
            <p className="text-sm text-gray-500">Initializing camera...</p>
          </div>
        </div>
      )}

      {scanError && (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {scanError}
        </div>
      )}

      <div
        id="qr-reader"
        ref={scannerRef}
        className="overflow-hidden rounded-lg"
      />
    </div>
  );
}

QRScanner.displayName = 'QRScanner';
