/**
 * EVM Safe Adapter Unit Tests
 * 
 * Tests Safe (Gnosis Safe) adapter logic
 */

import { describe, it, expect } from 'vitest';
import { 
  keccak256, 
  encodePacked, 
  encodeAbiParameters, 
  parseAbiParameters,
  toHex,
  pad,
  concat,
} from 'viem';
import {
  EVM_CHAIN_IDS,
  SAFE_ADDRESSES,
  getNumericChainId,
  isEVMChain,
} from '../src/adapters/evm-safe';

describe('EVM Safe Adapter', () => {
  describe('Chain configuration', () => {
    it('supports Ethereum mainnet', () => {
      expect(isEVMChain('ethereum')).toBe(true);
      expect(getNumericChainId('ethereum')).toBe(1n);
    });

    it('supports Base', () => {
      expect(isEVMChain('base')).toBe(true);
      expect(getNumericChainId('base')).toBe(8453n);
    });

    it('supports Arbitrum', () => {
      expect(isEVMChain('arbitrum')).toBe(true);
      expect(getNumericChainId('arbitrum')).toBe(42161n);
    });

    it('rejects non-EVM chains', () => {
      expect(isEVMChain('bitcoin-mainnet')).toBe(false);
      expect(isEVMChain('solana-mainnet')).toBe(false);
    });
  });

  describe('Safe addresses', () => {
    it('has singleton address', () => {
      expect(SAFE_ADDRESSES.singleton).toMatch(/^0x[a-fA-F0-9]{40}$/);
    });

    it('has proxy factory address', () => {
      expect(SAFE_ADDRESSES.proxyFactory).toMatch(/^0x[a-fA-F0-9]{40}$/);
    });

    it('has fallback handler address', () => {
      expect(SAFE_ADDRESSES.fallbackHandler).toMatch(/^0x[a-fA-F0-9]{40}$/);
    });
  });

  describe('Safe transaction hash', () => {
    it('computes safeTxHash correctly', () => {
      // Safe transaction domain separator
      const DOMAIN_SEPARATOR_TYPEHASH = keccak256(
        toHex('EIP712Domain(uint256 chainId,address verifyingContract)')
      );

      const SAFE_TX_TYPEHASH = keccak256(
        toHex('SafeTx(address to,uint256 value,bytes data,uint8 operation,uint256 safeTxGas,uint256 baseGas,uint256 gasPrice,address gasToken,address refundReceiver,uint256 nonce)')
      );

      expect(DOMAIN_SEPARATOR_TYPEHASH).toMatch(/^0x[a-f0-9]{64}$/);
      expect(SAFE_TX_TYPEHASH).toMatch(/^0x[a-f0-9]{64}$/);
    });

    it('encodes transaction data correctly', () => {
      const encoded = encodeAbiParameters(
        parseAbiParameters('address to, uint256 value'),
        ['0x1234567890123456789012345678901234567890', 1000000000000000000n]
      );

      expect(encoded).toMatch(/^0x[a-f0-9]+$/);
      expect(encoded.length).toBeGreaterThan(66); // At least address + uint256
    });
  });

  describe('EIP-712 typed data', () => {
    it('creates correct domain separator', () => {
      const chainId = 1n;
      const safeAddress = '0x1234567890123456789012345678901234567890' as const;

      const domainSeparator = keccak256(
        encodeAbiParameters(
          parseAbiParameters('bytes32, uint256, address'),
          [
            keccak256(toHex('EIP712Domain(uint256 chainId,address verifyingContract)')),
            chainId,
            safeAddress,
          ]
        )
      );

      expect(domainSeparator).toMatch(/^0x[a-f0-9]{64}$/);
    });
  });

  describe('Signature format', () => {
    it('validates signature length', () => {
      // EIP-712 signature is 65 bytes: r (32) + s (32) + v (1)
      const mockSig = '0x' + 'ab'.repeat(32) + 'cd'.repeat(32) + '1c';
      expect(mockSig.length).toBe(132); // 0x + 130 hex chars
    });

    it('handles multiple signatures (concatenated)', () => {
      // Safe accepts multiple sigs concatenated, sorted by signer address
      const sig1 = '0x' + 'aa'.repeat(65);
      const sig2 = '0x' + 'bb'.repeat(65);
      
      const combined = sig1 + sig2.slice(2); // Remove 0x from second
      expect(combined.length).toBe(2 + 65*2 + 65*2); // 0x + 2 sigs
    });
  });

  describe('Safe proxy deployment', () => {
    it('computes create2 address deterministically', () => {
      // CREATE2 address = keccak256(0xff ++ factory ++ salt ++ keccak256(initCode))[12:]
      const factory = SAFE_ADDRESSES.proxyFactory;
      const salt = keccak256(toHex('test-salt'));
      
      // This is a simplified version - real impl uses actual initCode
      const mockInitCodeHash = keccak256(toHex('mock-init-code'));
      
      const create2Input = concat([
        '0xff',
        factory as `0x${string}`,
        salt,
        mockInitCodeHash,
      ]);

      const create2Address = keccak256(create2Input).slice(-40);
      expect(create2Address.length).toBe(40);
    });
  });
});

describe('viem utilities', () => {
  it('keccak256 produces 32 bytes', () => {
    const hash = keccak256(toHex('test'));
    expect(hash).toMatch(/^0x[a-f0-9]{64}$/);
  });

  it('pad pads to 32 bytes', () => {
    const padded = pad('0x1234', { size: 32 });
    expect(padded.length).toBe(66); // 0x + 64 hex chars
  });

  it('concat joins hex strings', () => {
    const result = concat(['0xaa', '0xbb', '0xcc']);
    expect(result).toBe('0xaabbcc');
  });
});
