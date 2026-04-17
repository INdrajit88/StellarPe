'use client';

import { QRCodeSVG } from 'qrcode.react';

export interface QRCodeDisplayProps {
  /** The data to encode in the QR code (e.g. Stellar address or payment payload) */
  value: string;
  /** Size of the QR code in pixels. Defaults to 256. */
  size?: number;
}

/**
 * Renders a QR code as an SVG using qrcode.react.
 * Used by both User (scan) and Merchant (display payment QR) flows.
 *
 * @see Requirements 7.1 (static QR encoding Stellar address),
 *      7.2 (dynamic QR with amount and description)
 */
export function QRCodeDisplay({ value, size = 256 }: QRCodeDisplayProps) {
  if (!value) {
    return (
      <div
        className="flex items-center justify-center rounded-lg border border-gray-200 bg-gray-50"
        style={{ width: size, height: size }}
      >
        <p className="text-sm text-gray-400">No data to display</p>
      </div>
    );
  }

  return (
    <div className="inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white p-4">
      <QRCodeSVG
        value={value}
        size={size}
        level="M"
        includeMargin={false}
      />
    </div>
  );
}

QRCodeDisplay.displayName = 'QRCodeDisplay';
