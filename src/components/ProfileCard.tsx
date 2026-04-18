'use client';

import { useRef } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { CopyButton } from '@/components/CopyButton';
import { QRCodeDisplay } from '@/components/QRCodeDisplay';
import { QRDownloadButton } from '@/components/QRDownloadButton';

export interface ProfileCardProps {
  username: string;
  walletId: string;
  stellarAddress: string;
}

/**
 * Profile card displaying user identity and QR code for their Stellar address.
 *
 * Contains:
 * - Avatar placeholder showing the user's initial in a colored circle
 * - Username
 * - Wallet ID with adjacent CopyButton
 * - QR code encoding the Stellar address
 * - QRDownloadButton below the QR code
 *
 * @see Requirements 13.1, 13.2, 13.3, 13.4
 */
export function ProfileCard({ username, walletId, stellarAddress }: ProfileCardProps) {
  const qrRef = useRef<HTMLDivElement>(null);

  // Get the first letter of the username for the avatar placeholder
  const initial = username.charAt(0).toUpperCase();

  return (
    <GlassCard className="p-6">
      <div className="flex flex-col items-center gap-4">
        {/* Avatar placeholder — initials circle */}
        <div
          className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-2xl font-bold text-white"
          aria-hidden="true"
        >
          {initial}
        </div>

        {/* Username */}
        <h2 className="text-xl font-semibold text-white">{username}</h2>

        {/* Wallet ID with CopyButton */}
        <div className="flex w-full items-center justify-center gap-2">
          <span className="truncate text-sm text-gray-300" title={walletId}>
            {walletId}
          </span>
          <CopyButton value={walletId} label="Copy Wallet ID" />
        </div>

        {/* QR Code encoding the Stellar address */}
        <div ref={qrRef} className="mt-2">
          <QRCodeDisplay value={stellarAddress} size={200} />
        </div>

        {/* QR Download Button */}
        <QRDownloadButton
          qrRef={qrRef}
          filename={`stellarpe-qr-${username}`}
        />
      </div>
    </GlassCard>
  );
}

ProfileCard.displayName = 'ProfileCard';
