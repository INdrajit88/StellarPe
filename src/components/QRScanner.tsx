'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

export interface QRScannerProps {
  /** Callback fired when a QR code is successfully scanned */
  onScan: (decodedText: string) => void;
  /** Callback fired when an error occurs during scanning */
  onError?: (error: string) => void;
}

/**
 * Possible scanner error states with discriminated error types.
 * Each maps to a specific user-facing message and recovery action.
 */
type ScannerErrorType =
  | 'permission-denied'
  | 'no-camera'
  | 'camera-in-use'
  | 'stream-error'
  | 'init-failure';

interface ScannerError {
  type: ScannerErrorType;
  message: string;
  recoverable: boolean;
}

/** Map error types to user-facing messages and recovery info */
function classifyError(err: unknown): ScannerError {
  if (err instanceof DOMException || (err instanceof Error && err.name)) {
    const name = (err as DOMException).name || err.constructor.name;

    if (name === 'NotAllowedError') {
      return {
        type: 'permission-denied',
        message:
          'Camera access denied. Please enable camera permissions in your browser settings to scan QR codes.',
        recoverable: false,
      };
    }

    if (name === 'NotFoundError') {
      return {
        type: 'no-camera',
        message: 'No camera found. QR scanning requires a device with a camera.',
        recoverable: false,
      };
    }

    if (name === 'NotReadableError') {
      return {
        type: 'camera-in-use',
        message:
          'Camera is in use by another application. Please close other apps using the camera and try again.',
        recoverable: true,
      };
    }
  }

  // Runtime stream error or generic init failure
  if (err instanceof Error && err.message) {
    return {
      type: 'stream-error',
      message: 'Camera encountered an error. Please try again.',
      recoverable: true,
    };
  }

  return {
    type: 'init-failure',
    message: 'Failed to initialize QR scanner.',
    recoverable: true,
  };
}

/**
 * Camera-based QR scanner using html5-qrcode.
 * Performs a pre-flight getUserMedia check before initializing the scanner,
 * discriminates error types for appropriate user feedback, and provides
 * a retry mechanism for recoverable errors.
 *
 * Must be dynamically imported with ssr: false since html5-qrcode
 * requires browser APIs (navigator.mediaDevices).
 *
 * @see Requirements 11.1, 11.2, 11.3, 11.4, 11.5, 11.6
 */
export function QRScanner({ onScan, onError }: QRScannerProps) {
  const scannerRef = useRef<HTMLDivElement>(null);
  const html5QrScannerRef = useRef<unknown>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mountedRef = useRef(true);

  const [isInitializing, setIsInitializing] = useState(true);
  const [scannerError, setScannerError] = useState<ScannerError | null>(null);

  const stopAllStreams = useCallback(() => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
  }, []);

  const cleanupScanner = useCallback(async () => {
    const scanner = html5QrScannerRef.current as { clear?: () => Promise<void> } | null;
    if (scanner?.clear) {
      try {
        await scanner.clear();
      } catch {
        // Swallow cleanup errors — scanner may already be cleared
      }
      html5QrScannerRef.current = null;
    }
    stopAllStreams();
  }, [stopAllStreams]);

  const initScanner = useCallback(async () => {
    if (!mountedRef.current) return;

    // Reset state for retry
    setScannerError(null);
    setIsInitializing(true);

    // Clean up any previous scanner instance before re-initializing
    await cleanupScanner();

    try {
      // Pre-flight check: request camera access to detect permission/hardware issues early
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });

      if (!mountedRef.current) {
        // Component unmounted during async operation — stop the stream
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      // Store the stream so we can stop it on unmount
      mediaStreamRef.current = stream;

      // Attach an error handler to each track for runtime stream errors
      stream.getTracks().forEach((track) => {
        track.addEventListener('ended', () => {
          if (mountedRef.current) {
            setScannerError({
              type: 'stream-error',
              message: 'Camera encountered an error. Please try again.',
              recoverable: true,
            });
            onError?.('Camera encountered an error. Please try again.');
          }
        });
      });

      // Stop the pre-flight stream — html5-qrcode will request its own
      stream.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;

      if (!mountedRef.current || !scannerRef.current) return;

      const { Html5QrcodeScanner } = await import('html5-qrcode');

      if (!mountedRef.current) return;

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

      if (mountedRef.current) {
        setIsInitializing(false);
      }
    } catch (err) {
      if (!mountedRef.current) return;

      const classified = classifyError(err);
      setScannerError(classified);
      setIsInitializing(false);
      onError?.(classified.message);
    }
  }, [cleanupScanner, onScan, onError]);

  useEffect(() => {
    mountedRef.current = true;
    initScanner();

    return () => {
      mountedRef.current = false;
      // Clean up scanner and stop all camera streams on unmount
      const scanner = html5QrScannerRef.current as { clear?: () => Promise<void> } | null;
      if (scanner?.clear) {
        scanner.clear().catch(() => {
          // Swallow cleanup errors
        });
        html5QrScannerRef.current = null;
      }
      // Stop any active media streams
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRetry = useCallback(() => {
    initScanner();
  }, [initScanner]);

  return (
    <div className="w-full">
      {isInitializing && !scannerError && (
        <div className="flex items-center justify-center py-12">
          <div className="flex flex-col items-center gap-2">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
            <p className="text-sm text-gray-500">Initializing camera...</p>
          </div>
        </div>
      )}

      {scannerError && (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          <p>{scannerError.message}</p>
          {scannerError.recoverable && (
            <button
              type="button"
              onClick={handleRetry}
              className="mt-3 inline-flex items-center rounded-md bg-red-100 px-3 py-1.5 text-sm font-medium text-red-800 hover:bg-red-200 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 transition-colors"
            >
              Retry
            </button>
          )}
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
