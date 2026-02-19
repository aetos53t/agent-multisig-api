/**
 * EVM Safe Adapter Tests
 */

import { describe, test, expect } from 'bun:test';
import {
  EVMSafeAdapter,
  predictSafeAddress,
  computeSafeTxHash,
  buildSafeTypedData,
  encodeSignatures,
  isEVMChain,
  getNumericChainId,
  EVM_CHAIN_IDS,
  SAFE_ADDRESSES,
} from '../src/adapters/evm-safe';

describe('EVM Chain Utilities', () => {
  test('isEVMChain correctly identifies EVM chains', () => {
    expect(isEVMChain('ethereum')).toBe(true);
    expect(isEVMChain('base')).toBe(true);
    expect(isEVMChain('arbitrum')).toBe(true);
    expect(isEVMChain('bitcoin-mainnet')).toBe(false);
    expect(isEVMChain('stacks-mainnet')).toBe(false);
  });
  
  test('getNumericChainId returns correct values', () => {
    expect(getNumericChainId('ethereum')).toBe(1n);
    expect(getNumericChainId('base')).toBe(8453n);
    expect(getNumericChainId('arbitrum')).toBe(42161n);
  });
  
  test('getNumericChainId throws for unsupported chains', () => {
    expect(() => getNumericChainId('bitcoin-mainnet')).toThrow();
  });
});

describe('Safe Address Prediction', () => {
  const testOwners: `0x${string}`[] = [
    '0x1111111111111111111111111111111111111111',
    '0x2222222222222222222222222222222222222222',
    '0x3333333333333333333333333333333333333333',
  ];
  
  test('predictSafeAddress returns valid address format', () => {
    const address = predictSafeAddress({
      owners: testOwners,
      threshold: 2,
    }, 'ethereum');
    
    expect(address).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });
  
  test('predictSafeAddress is deterministic', () => {
    const address1 = predictSafeAddress({
      owners: testOwners,
      threshold: 2,
    }, 'ethereum');
    
    const address2 = predictSafeAddress({
      owners: testOwners,
      threshold: 2,
    }, 'ethereum');
    
    expect(address1).toBe(address2);
  });
  
  test('predictSafeAddress changes with different owners', () => {
    const address1 = predictSafeAddress({
      owners: testOwners,
      threshold: 2,
    }, 'ethereum');
    
    const differentOwners: `0x${string}`[] = [
      '0x4444444444444444444444444444444444444444',
      '0x5555555555555555555555555555555555555555',
    ];
    
    const address2 = predictSafeAddress({
      owners: differentOwners,
      threshold: 2,
    }, 'ethereum');
    
    expect(address1).not.toBe(address2);
  });
  
  test('predictSafeAddress changes with different threshold', () => {
    const address1 = predictSafeAddress({
      owners: testOwners,
      threshold: 2,
    }, 'ethereum');
    
    const address2 = predictSafeAddress({
      owners: testOwners,
      threshold: 3,
    }, 'ethereum');
    
    expect(address1).not.toBe(address2);
  });
  
  test('predictSafeAddress changes with different saltNonce', () => {
    const address1 = predictSafeAddress({
      owners: testOwners,
      threshold: 2,
      saltNonce: '0',
    }, 'ethereum');
    
    const address2 = predictSafeAddress({
      owners: testOwners,
      threshold: 2,
      saltNonce: '1',
    }, 'ethereum');
    
    expect(address1).not.toBe(address2);
  });
  
  test('predictSafeAddress is order-independent (owners get sorted)', () => {
    const address1 = predictSafeAddress({
      owners: [testOwners[0], testOwners[1], testOwners[2]],
      threshold: 2,
    }, 'ethereum');
    
    const address2 = predictSafeAddress({
      owners: [testOwners[2], testOwners[0], testOwners[1]], // Different order
      threshold: 2,
    }, 'ethereum');
    
    expect(address1).toBe(address2);
  });
});

describe('Safe Transaction Hash', () => {
  const safeAddress = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045' as `0x${string}`;
  const chainId = 1n;
  
  const baseTxData = {
    to: '0x1111111111111111111111111111111111111111' as `0x${string}`,
    value: '1000000000000000000', // 1 ETH
    data: '0x' as `0x${string}`,
    operation: 0 as const,
    safeTxGas: '0',
    baseGas: '0',
    gasPrice: '0',
    gasToken: '0x0000000000000000000000000000000000000000' as `0x${string}`,
    refundReceiver: '0x0000000000000000000000000000000000000000' as `0x${string}`,
    nonce: 0,
  };
  
  test('computeSafeTxHash returns valid hash format', () => {
    const hash = computeSafeTxHash(safeAddress, chainId, baseTxData);
    expect(hash).toMatch(/^0x[0-9a-fA-F]{64}$/);
  });
  
  test('computeSafeTxHash is deterministic', () => {
    const hash1 = computeSafeTxHash(safeAddress, chainId, baseTxData);
    const hash2 = computeSafeTxHash(safeAddress, chainId, baseTxData);
    expect(hash1).toBe(hash2);
  });
  
  test('computeSafeTxHash changes with different to address', () => {
    const hash1 = computeSafeTxHash(safeAddress, chainId, baseTxData);
    const hash2 = computeSafeTxHash(safeAddress, chainId, {
      ...baseTxData,
      to: '0x2222222222222222222222222222222222222222' as `0x${string}`,
    });
    expect(hash1).not.toBe(hash2);
  });
  
  test('computeSafeTxHash changes with different value', () => {
    const hash1 = computeSafeTxHash(safeAddress, chainId, baseTxData);
    const hash2 = computeSafeTxHash(safeAddress, chainId, {
      ...baseTxData,
      value: '2000000000000000000',
    });
    expect(hash1).not.toBe(hash2);
  });
  
  test('computeSafeTxHash changes with different nonce', () => {
    const hash1 = computeSafeTxHash(safeAddress, chainId, baseTxData);
    const hash2 = computeSafeTxHash(safeAddress, chainId, {
      ...baseTxData,
      nonce: 1,
    });
    expect(hash1).not.toBe(hash2);
  });
  
  test('computeSafeTxHash changes with different chain', () => {
    const hash1 = computeSafeTxHash(safeAddress, 1n, baseTxData);
    const hash2 = computeSafeTxHash(safeAddress, 8453n, baseTxData);
    expect(hash1).not.toBe(hash2);
  });
});

describe('EIP-712 Typed Data', () => {
  const safeAddress = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045' as `0x${string}`;
  const chainId = 8453n;
  
  const txData = {
    to: '0x1111111111111111111111111111111111111111' as `0x${string}`,
    value: '1000000000000000000',
    data: '0x' as `0x${string}`,
    operation: 0 as const,
    safeTxGas: '0',
    baseGas: '0',
    gasPrice: '0',
    gasToken: '0x0000000000000000000000000000000000000000' as `0x${string}`,
    refundReceiver: '0x0000000000000000000000000000000000000000' as `0x${string}`,
    nonce: 5,
  };
  
  test('buildSafeTypedData has correct structure', () => {
    const typedData = buildSafeTypedData(safeAddress, chainId, txData);
    
    expect(typedData.domain.name).toBe('Safe');
    expect(typedData.domain.version).toBe('1.3.0');
    expect(typedData.domain.chainId).toBe(chainId);
    expect(typedData.domain.verifyingContract).toBe(safeAddress);
    expect(typedData.primaryType).toBe('SafeTx');
  });
  
  test('buildSafeTypedData message matches txData', () => {
    const typedData = buildSafeTypedData(safeAddress, chainId, txData);
    
    expect(typedData.message.to).toBe(txData.to);
    expect(typedData.message.value).toBe(txData.value);
    expect(typedData.message.nonce).toBe(txData.nonce);
    expect(typedData.message.operation).toBe(txData.operation);
  });
  
  test('buildSafeTypedData has required types', () => {
    const typedData = buildSafeTypedData(safeAddress, chainId, txData);
    
    expect(typedData.types.EIP712Domain).toBeDefined();
    expect(typedData.types.SafeTx).toBeDefined();
    expect(typedData.types.SafeTx.length).toBe(10); // All SafeTx fields
  });
});

describe('Signature Encoding', () => {
  test('encodeSignatures concatenates signatures', () => {
    const signatures = [
      {
        signer: '0x1111111111111111111111111111111111111111' as `0x${string}`,
        data: '0x' + 'aa'.repeat(65) as `0x${string}`,
        isContractSignature: false,
      },
      {
        signer: '0x2222222222222222222222222222222222222222' as `0x${string}`,
        data: '0x' + 'bb'.repeat(65) as `0x${string}`,
        isContractSignature: false,
      },
    ];
    
    const encoded = encodeSignatures(signatures);
    
    expect(encoded).toMatch(/^0x[0-9a-fA-F]+$/);
    expect(encoded.length).toBe(2 + 130 * 2); // 0x + 65 bytes * 2 sigs * 2 hex chars
  });
  
  test('encodeSignatures sorts by signer address', () => {
    const sig1 = {
      signer: '0x2222222222222222222222222222222222222222' as `0x${string}`,
      data: '0x' + 'aa'.repeat(65) as `0x${string}`,
      isContractSignature: false,
    };
    const sig2 = {
      signer: '0x1111111111111111111111111111111111111111' as `0x${string}`,
      data: '0x' + 'bb'.repeat(65) as `0x${string}`,
      isContractSignature: false,
    };
    
    // Pass in wrong order
    const encoded = encodeSignatures([sig1, sig2]);
    
    // Should be sorted: sig2 (0x1111...) first, then sig1 (0x2222...)
    expect(encoded.slice(2, 132)).toBe('bb'.repeat(65)); // sig2's data first
    expect(encoded.slice(132, 262)).toBe('aa'.repeat(65)); // sig1's data second
  });
});

describe('EVMSafeAdapter', () => {
  test('constructor accepts valid EVM chains', () => {
    expect(() => new EVMSafeAdapter('ethereum')).not.toThrow();
    expect(() => new EVMSafeAdapter('base')).not.toThrow();
    expect(() => new EVMSafeAdapter('arbitrum')).not.toThrow();
  });
  
  test('constructor rejects non-EVM chains', () => {
    expect(() => new EVMSafeAdapter('bitcoin-mainnet' as any)).toThrow();
    expect(() => new EVMSafeAdapter('stacks-mainnet' as any)).toThrow();
  });
  
  test('predictAddress returns valid address', () => {
    const adapter = new EVMSafeAdapter('base');
    const address = adapter.predictAddress({
      owners: [
        '0x1111111111111111111111111111111111111111',
        '0x2222222222222222222222222222222222222222',
      ],
      threshold: 2,
    });
    
    expect(address).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });
});

describe('Safe Contract Addresses', () => {
  test('SAFE_ADDRESSES has required contract addresses', () => {
    expect(SAFE_ADDRESSES.singleton).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(SAFE_ADDRESSES.singletonL2).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(SAFE_ADDRESSES.proxyFactory).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(SAFE_ADDRESSES.fallbackHandler).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });
});
