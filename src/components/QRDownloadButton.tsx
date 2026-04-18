'use client';

import { useCallback, type RefObject } from 'react';
import { useToast } from '@/contexts/ToastContext';

export interface QRDownloadButtonProps {
  /** Ref to the container holding the QRCodeSVG element */
  qrRef: RefObject<HTMLDivElement | null>;
  /** Filename for the downloaded PNG (without extension) */
  filename: string;
  /** Download resolution in pixels. Default: 512 */
  resolution?: number;
  /** Optional additional CSS classes */
  className?: string;
}

/**
 * Button that downloads a QR code SVG as a high-resolution PNG.
 *
 * On click: finds the SVG inside `qrRef.current`, serializes it via
 * XMLSerializer, draws it onto a canvas at the specified resolution,
 * and triggers a download via a temporary <a> element.
 *
 * @see Requirements 9.1, 9.2, 9.3
 */
export function QRDownloadButton({
  qrRef,
  filename,
  resolution = 512,
  className = '',
}: QRDownloadButtonProps) {
  const toast = useToast();

  const svgAvailable = (): boolean => {
    return !!qrRef.current?.querySelector('svg');
  };

  const handleDownload = useCallback(() => {
    const container = qrRef.current;
    if (!container) {
      toast.show('QR code not available for download');
      return;
    }

    const svgElement = container.querySelector('svg');
    if (!svgElement) {
      toast.show('QR code not available for download');
      return;
    }

    try {
      // Serialize the SVG to a string
      const serializer = new XMLSerializer();
      const svgString = serializer.serializeToString(svgElement);

      // Create a data URL from the SVG string
      const svgDataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgString)}`;

      // Create an Image and draw it onto a canvas at the target resolution
      const img = new Image();

      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = resolution;
          canvas.height = resolution;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            toast.show('Failed to generate QR image. Please try again.');
            return;
          }

          // Fill with white background so the QR code is scannable
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, resolution, resolution);

          // Draw the SVG image scaled to the canvas
          ctx.drawImage(img, 0, 0, resolution, resolution);

          const pngDataUrl = canvas.toDataURL('image/png');

          // Trigger download via a temporary <a> element
          const link = document.createElement('a');
          link.download = `${filename}.png`;
          link.href = pngDataUrl;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        } catch {
          toast.show('Failed to generate QR image. Please try again.');
        }
      };

      img.onerror = () => {
        toast.show('Failed to process QR code for download.');
      };

      img.src = svgDataUrl;
    } catch {
      toast.show('Failed to generate QR image. Please try again.');
    }
  }, [qrRef, filename, resolution, toast]);

  const disabled = !svgAvailable();

  return (
    <button
      type="button"
      onClick={handleDownload}
      disabled={disabled}
      aria-label={`Download QR code as ${filename}.png`}
      title="Download QR code"
      className={`inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors duration-150 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      {/* Download icon */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
      </svg>
      Download QR
    </button>
  );
}

QRDownloadButton.displayName = 'QRDownloadButton';
