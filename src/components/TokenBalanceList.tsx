'use client';

/**
 * Token balance data shape returned by GET /api/tokens/balances.
 */
export interface TokenBalance {
  contractId: string;
  name: string;
  symbol: string;
  decimals: number;
  balance: string;
}

export interface TokenBalanceListProps {
  /** Array of token balances to display */
  balances: TokenBalance[];
}

/**
 * Formats a raw token balance string by dividing by 10^decimals.
 * Returns a human-readable string with appropriate decimal places.
 */
export function formatTokenBalance(balance: string, decimals: number): string {
  if (decimals === 0) {
    return BigInt(balance).toLocaleString();
  }

  const raw = BigInt(balance);
  const divisor = BigInt(10) ** BigInt(decimals);
  const wholePart = raw / divisor;
  const fractionalPart = raw % divisor;

  // Pad fractional part with leading zeros to match decimal places
  const fractionalStr = fractionalPart
    .toString()
    .padStart(decimals, '0')
    // Trim trailing zeros but keep at least 2 decimal places
    .replace(/0+$/, '')
    .padEnd(Math.min(decimals, 2), '0');

  return `${wholePart.toLocaleString()}.${fractionalStr}`;
}

/**
 * Displays a list of custom token balances with name, symbol, and formatted balance.
 * Shows an empty state message when no tokens are held.
 *
 * Uses the existing Card component for consistent styling and follows
 * mobile-first Tailwind CSS responsive patterns.
 *
 * @see Requirements 10.1, 10.3, 10.5
 */
export function TokenBalanceList({ balances }: TokenBalanceListProps) {
  if (balances.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-gray-500">
        No custom tokens held
      </div>
    );
  }

  return (
    <ul className="divide-y divide-gray-100" role="list">
      {balances.map((token) => (
        <li
          key={token.contractId}
          className="flex items-center justify-between gap-3 py-3"
        >
          {/* Left: token identity */}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-gray-900 truncate">
              {token.name}
            </p>
            <p className="text-xs text-gray-500">{token.symbol}</p>
          </div>

          {/* Right: formatted balance */}
          <div className="flex-shrink-0 text-right">
            <p className="text-sm font-semibold text-gray-900">
              {formatTokenBalance(token.balance, token.decimals)}
            </p>
            <p className="text-xs text-gray-400">{token.symbol}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

TokenBalanceList.displayName = 'TokenBalanceList';
