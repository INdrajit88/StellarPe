'use client';

/**
 * LP position data shape returned by GET /api/pools/positions.
 */
export interface LPPosition {
  poolContractId: string;
  poolName?: string;
  shares: string;
  tokenAContractId: string;
  tokenBContractId: string;
  depositedAmountA?: string;
  depositedAmountB?: string;
  shareValue?: string;
  earnedFees?: string;
}

export interface LPPositionListProps {
  /** Array of LP positions to display */
  positions: LPPosition[];
}

/**
 * Truncates a Stellar contract ID for display: first 6 + last 4 characters.
 */
export function truncateContractId(contractId: string): string {
  if (contractId.length <= 12) return contractId;
  return `${contractId.slice(0, 6)}...${contractId.slice(-4)}`;
}

/**
 * Displays a list of liquidity pool positions with pool identifier,
 * share amount, and token pair info.
 * Shows an empty state message when no positions exist.
 *
 * Uses the existing Card component for consistent styling and follows
 * mobile-first Tailwind CSS responsive patterns.
 *
 * @see Requirements 10.2
 */
export function LPPositionList({ positions }: LPPositionListProps) {
  if (positions.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-gray-500">
        No liquidity pool positions
      </div>
    );
  }

  return (
    <ul className="divide-y divide-gray-100" role="list">
      {positions.map((position) => {
        const poolLabel =
          position.poolName ||
          `Pool ${truncateContractId(position.poolContractId)}`;

        return (
          <li
            key={position.poolContractId}
            className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
          >
            {/* Left: pool identity and token pair */}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-gray-900 truncate">
                {poolLabel}
              </p>
              <p className="text-xs text-gray-500">
                {truncateContractId(position.tokenAContractId)} /{' '}
                {truncateContractId(position.tokenBContractId)}
              </p>
            </div>

            {/* Right: shares and optional value info */}
            <div className="flex-shrink-0 text-left sm:text-right">
              <p className="text-sm font-semibold text-gray-900">
                {BigInt(position.shares).toLocaleString()} shares
              </p>
              {position.earnedFees && (
                <p className="text-xs text-green-600">
                  +{position.earnedFees} fees earned
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

LPPositionList.displayName = 'LPPositionList';
