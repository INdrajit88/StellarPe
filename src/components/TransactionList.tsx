'use client';

import { CopyButton } from '@/components/CopyButton';

/**
 * Transaction type matching the API response shape from /api/payments/history.
 */
export interface Transaction {
  id: string;
  stellarTxId: string | null;
  senderAddress: string;
  recipientAddress: string;
  senderId: string | null;
  recipientId: string | null;
  amount: string;
  memo: string | null;
  status: 'COMPLETED' | 'FAILED';
  createdAt: string;
}

export interface TransactionListProps {
  /** Array of transactions to display */
  transactions: Transaction[];
  /** The current user's ID, used to determine sent vs received */
  currentUserId: string;
  /** Optional: show empty state message */
  emptyMessage?: string;
}

/**
 * Shared component for displaying transaction lists with sent/received indicators.
 * Color-coded: green for received, red for sent.
 *
 * @see Requirements 10.1 (display recent transactions on User Dashboard),
 *      11.1 (display recent transactions on Merchant Dashboard)
 */
export function TransactionList({
  transactions,
  currentUserId,
  emptyMessage = 'No transactions yet',
}: TransactionListProps) {
  if (transactions.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-gray-500">
        {emptyMessage}
      </div>
    );
  }

  return (
    <ul className="divide-y divide-gray-100" role="list">
      {transactions.map((tx) => {
        const isSent = tx.senderId === currentUserId;
        const direction = isSent ? 'Sent' : 'Received';
        const directionColor = isSent ? 'text-red-600' : 'text-green-600';
        const amountPrefix = isSent ? '-' : '+';

        return (
          <li key={tx.id} className="flex items-center justify-between gap-3 py-3">
            {/* Left: direction indicator + details */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                {/* Direction badge */}
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                    isSent
                      ? 'bg-red-50 text-red-700'
                      : 'bg-green-50 text-green-700'
                  }`}
                >
                  {direction}
                </span>

                {/* Status badge */}
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                    tx.status === 'COMPLETED'
                      ? 'bg-blue-50 text-blue-700'
                      : 'bg-yellow-50 text-yellow-700'
                  }`}
                >
                  {tx.status === 'COMPLETED' ? 'Completed' : 'Failed'}
                </span>
              </div>

              {/* Address (counterparty) */}
              <p className="mt-1 truncate text-sm text-gray-600">
                {isSent
                  ? `To: ${tx.recipientAddress.slice(0, 8)}...${tx.recipientAddress.slice(-6)}`
                  : `From: ${tx.senderAddress.slice(0, 8)}...${tx.senderAddress.slice(-6)}`}
              </p>

              {/* Timestamp */}
              <p className="text-xs text-gray-400">
                {new Date(tx.createdAt).toLocaleString()}
              </p>

              {/* Transaction ID */}
              {tx.stellarTxId && (
                <div className="flex items-center gap-1">
                  <p className="truncate text-xs text-gray-400" title={tx.stellarTxId}>
                    TX: {tx.stellarTxId.slice(0, 12)}...
                  </p>
                  <CopyButton value={tx.stellarTxId} label="Copy transaction ID" />
                  <a
                    href={`https://stellar.expert/explorer/testnet/tx/${tx.stellarTxId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-1 text-xs text-blue-600 hover:text-blue-800 hover:underline"
                  >
                    View
                  </a>
                </div>
              )}
            </div>

            {/* Right: amount */}
            <div className="flex-shrink-0 text-right">
              <p className={`text-sm font-semibold ${directionColor}`}>
                {amountPrefix}
                {parseFloat(tx.amount).toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 7,
                })}{' '}
                XLM
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

TransactionList.displayName = 'TransactionList';
