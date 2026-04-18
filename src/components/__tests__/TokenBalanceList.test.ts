/**
 * Unit tests for TokenBalanceList component logic.
 *
 * Tests the exported formatTokenBalance helper and the component's
 * data contract. DOM rendering is not tested because the project
 * does not include @testing-library/react.
 *
 * Validates: Requirements 10.1, 10.3, 10.5
 */

import { formatTokenBalance, TokenBalance } from '../TokenBalanceList';

describe('formatTokenBalance', () => {
  it('formats balance with 0 decimals as a whole number', () => {
    expect(formatTokenBalance('1000', 0)).toBe('1,000');
  });

  it('formats balance with 7 decimals (XLM-like)', () => {
    // 12345670000 / 10^7 = 1234.567
    expect(formatTokenBalance('12345670000', 7)).toBe('1,234.567');
  });

  it('formats balance with 18 decimals (ETH-like)', () => {
    // 1000000000000000000 / 10^18 = 1.00
    expect(formatTokenBalance('1000000000000000000', 18)).toBe('1.00');
  });

  it('formats zero balance', () => {
    expect(formatTokenBalance('0', 7)).toBe('0.00');
  });

  it('formats balance with trailing zeros trimmed but keeps at least 2 decimal places', () => {
    // 1000000 / 10^6 = 1.000000 → trimmed to 1.00
    expect(formatTokenBalance('1000000', 6)).toBe('1.00');
  });

  it('formats fractional-only balance (less than 1 whole unit)', () => {
    // 500 / 10^7 = 0.00005
    expect(formatTokenBalance('500', 7)).toBe('0.00005');
  });

  it('formats large balance correctly', () => {
    // 999999999999999 / 10^7 = 99999999.9999999
    expect(formatTokenBalance('999999999999999', 7)).toBe('99,999,999.9999999');
  });

  it('formats balance with 1 decimal', () => {
    // 15 / 10^1 = 1.5 (only 1 decimal place available)
    expect(formatTokenBalance('15', 1)).toBe('1.5');
  });
});

describe('TokenBalance interface', () => {
  it('accepts a valid token balance object', () => {
    const balance: TokenBalance = {
      contractId: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      name: 'Test Token',
      symbol: 'TST',
      decimals: 7,
      balance: '10000000',
    };

    expect(balance.contractId).toBeDefined();
    expect(balance.name).toBe('Test Token');
    expect(balance.symbol).toBe('TST');
    expect(balance.decimals).toBe(7);
    expect(balance.balance).toBe('10000000');
  });
});
