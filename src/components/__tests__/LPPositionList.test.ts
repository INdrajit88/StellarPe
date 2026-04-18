/**
 * Unit tests for LPPositionList component logic.
 *
 * Tests the exported truncateContractId helper and the component's
 * data contract. DOM rendering is not tested because the project
 * does not include @testing-library/react.
 *
 * Validates: Requirements 10.2
 */

import { truncateContractId, LPPosition } from '../LPPositionList';

describe('truncateContractId', () => {
  it('truncates a long contract ID to first 6 + last 4 characters', () => {
    const contractId = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
    expect(truncateContractId(contractId)).toBe('CAAAAA...AAAA');
  });

  it('returns short IDs unchanged (12 chars or less)', () => {
    expect(truncateContractId('ABCDEF')).toBe('ABCDEF');
    expect(truncateContractId('ABCDEFGHIJKL')).toBe('ABCDEFGHIJKL');
  });

  it('truncates IDs longer than 12 characters', () => {
    expect(truncateContractId('ABCDEFGHIJKLM')).toBe('ABCDEF...JKLM');
  });
});

describe('LPPosition interface', () => {
  it('accepts a valid LP position object with required fields', () => {
    const position: LPPosition = {
      poolContractId: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      shares: '1000000',
      tokenAContractId: 'CBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
      tokenBContractId: 'CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC',
    };

    expect(position.poolContractId).toBeDefined();
    expect(position.shares).toBe('1000000');
    expect(position.tokenAContractId).toBeDefined();
    expect(position.tokenBContractId).toBeDefined();
  });

  it('accepts optional fields', () => {
    const position: LPPosition = {
      poolContractId: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      poolName: 'XLM/USDC Pool',
      shares: '500000',
      tokenAContractId: 'CBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
      tokenBContractId: 'CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC',
      depositedAmountA: '1000',
      depositedAmountB: '2000',
      shareValue: '3000',
      earnedFees: '15.50',
    };

    expect(position.poolName).toBe('XLM/USDC Pool');
    expect(position.earnedFees).toBe('15.50');
  });
});
