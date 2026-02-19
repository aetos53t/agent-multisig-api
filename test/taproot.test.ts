/**
 * Taproot Service Tests
 * 
 * Run with: bun test test/taproot.test.ts
 */

import { describe, test, expect } from 'bun:test';
import { hex } from '@scure/base';
import { secp256k1 } from '@noble/curves/secp256k1';
import {
  buildChecksigAddScript,
  buildMultisigLeaves,
  createP2TRMultisig,
  compressedToXOnly,
} from '../src/services/taproot';

// Generate valid test pubkeys from known private keys
// These are TEST KEYS ONLY - never use in production!
const TEST_PRIVKEYS = [
  '0000000000000000000000000000000000000000000000000000000000000001',
  '0000000000000000000000000000000000000000000000000000000000000002',
  '0000000000000000000000000000000000000000000000000000000000000003',
];

// Derive x-only pubkeys from private keys
const TEST_PUBKEYS = TEST_PRIVKEYS.map(priv => {
  const point = secp256k1.ProjectivePoint.fromPrivateKey(hex.decode(priv));
  return point.toHex(true).slice(2); // x-only (remove 02/03 prefix)
});

// Also keep some arbitrary bytes for script-only tests (not used for p2tr)
const ARBITRARY_32_BYTES = [
  'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
  'd4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5',
  '789abcde789abcde789abcde789abcde789abcde789abcde789abcde789abcde',
];

describe('Tapscript Construction', () => {
  test('builds valid 2-of-2 script', () => {
    // Use arbitrary bytes for script-only tests (no secp256k1 validation)
    const pubkeys = ARBITRARY_32_BYTES.slice(0, 2).map(hex.decode);
    const script = buildChecksigAddScript(pubkeys, 2);
    
    // Script should be: 
    // 0x20 <pk1> 0xac 0x20 <pk2> 0xba 0x52 0x9c
    // = 1 + 32 + 1 + 1 + 32 + 1 + 1 + 1 = 70 bytes
    expect(script.length).toBe(70);
    
    // First byte should be push 32
    expect(script[0]).toBe(0x20);
    
    // After first pubkey, should be OP_CHECKSIG
    expect(script[33]).toBe(0xac);
    
    // Last two bytes should be OP_2 and OP_NUMEQUAL
    expect(script[script.length - 2]).toBe(0x52); // OP_2
    expect(script[script.length - 1]).toBe(0x9c); // OP_NUMEQUAL
  });
  
  test('builds valid 2-of-3 script', () => {
    const pubkeys = ARBITRARY_32_BYTES.map(hex.decode);
    const script = buildChecksigAddScript(pubkeys, 2);
    
    // 3 pubkeys * 34 + 2 = 104 bytes
    expect(script.length).toBe(104);
  });
  
  test('throws on invalid threshold', () => {
    const pubkeys = ARBITRARY_32_BYTES.slice(0, 2).map(hex.decode);
    
    expect(() => buildChecksigAddScript(pubkeys, 0)).toThrow();
    expect(() => buildChecksigAddScript(pubkeys, 17)).toThrow();
    expect(() => buildChecksigAddScript(pubkeys, 3)).toThrow(); // More than pubkeys
  });
  
  test('throws on invalid pubkey length', () => {
    const badPubkey = new Uint8Array(31); // Too short
    expect(() => buildChecksigAddScript([badPubkey], 1)).toThrow();
  });
});

describe('Multisig Leaves', () => {
  test('generates correct number of leaves for 2-of-3', () => {
    const pubkeys = ARBITRARY_32_BYTES.map(hex.decode);
    const leaves = buildMultisigLeaves(pubkeys, 2);
    
    // 3 choose 2 = 3 combinations
    expect(leaves.length).toBe(3);
  });
  
  test('generates correct number of leaves for 2-of-4', () => {
    const pubkeys = [...ARBITRARY_32_BYTES, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa']
      .map(hex.decode);
    const leaves = buildMultisigLeaves(pubkeys, 2);
    
    // 4 choose 2 = 6 combinations
    expect(leaves.length).toBe(6);
  });
  
  test('generates correct number of leaves for 3-of-5', () => {
    const pubkeys = [
      ...ARBITRARY_32_BYTES,
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    ].map(hex.decode);
    const leaves = buildMultisigLeaves(pubkeys, 3);
    
    // 5 choose 3 = 10 combinations
    expect(leaves.length).toBe(10);
  });
  
  test('tracks pubkey indices correctly', () => {
    const pubkeys = ARBITRARY_32_BYTES.map(hex.decode);
    const leaves = buildMultisigLeaves(pubkeys, 2);
    
    // Each leaf should reference exactly 2 indices
    for (const leaf of leaves) {
      expect(leaf.pubkeyIndices.length).toBe(2);
      expect(leaf.pubkeyIndices[0]).toBeGreaterThanOrEqual(0);
      expect(leaf.pubkeyIndices[0]).toBeLessThan(3);
      expect(leaf.pubkeyIndices[1]).toBeGreaterThanOrEqual(0);
      expect(leaf.pubkeyIndices[1]).toBeLessThan(3);
    }
  });
});

describe('P2TR Multisig Address', () => {
  test('creates valid mainnet address', () => {
    const result = createP2TRMultisig(TEST_PUBKEYS, 2, 'bitcoin-mainnet');
    
    expect(result.address).toMatch(/^bc1p[a-z0-9]{58}$/);
    expect(result.internalPubkey.length).toBe(64);
    expect(result.tweakedPubkey.length).toBe(64);
    expect(result.leaves.length).toBe(3);
    expect(result.scriptTree.leaves.length).toBe(3);
  });
  
  test('creates valid testnet address', () => {
    const result = createP2TRMultisig(TEST_PUBKEYS, 2, 'bitcoin-testnet');
    
    expect(result.address).toMatch(/^tb1p[a-z0-9]{58}$/);
  });
  
  test('creates valid signet address', () => {
    const result = createP2TRMultisig(TEST_PUBKEYS, 2, 'bitcoin-signet');
    
    expect(result.address).toMatch(/^tb1p[a-z0-9]{58}$/);
  });
  
  test('produces deterministic address', () => {
    const result1 = createP2TRMultisig(TEST_PUBKEYS, 2, 'bitcoin-mainnet');
    const result2 = createP2TRMultisig(TEST_PUBKEYS, 2, 'bitcoin-mainnet');
    
    expect(result1.address).toBe(result2.address);
    expect(result1.tweakedPubkey).toBe(result2.tweakedPubkey);
  });
  
  test('different pubkey order produces different address (tree structure differs)', () => {
    const reversed = [...TEST_PUBKEYS].reverse();
    const result1 = createP2TRMultisig(TEST_PUBKEYS, 2, 'bitcoin-mainnet');
    const result2 = createP2TRMultisig(reversed, 2, 'bitcoin-mainnet');
    
    // Different order creates different tree structure (combination ordering)
    // This is expected - callers should sort pubkeys before calling if determinism needed
    expect(result1.address).not.toBe(result2.address);
  });
  
  test('sorted pubkeys produce same address', () => {
    const sorted1 = [...TEST_PUBKEYS].sort();
    const sorted2 = [...TEST_PUBKEYS].sort();
    const result1 = createP2TRMultisig(sorted1, 2, 'bitcoin-mainnet');
    const result2 = createP2TRMultisig(sorted2, 2, 'bitcoin-mainnet');
    
    expect(result1.address).toBe(result2.address);
  });
  
  test('different threshold produces different address', () => {
    // Need at least 3 pubkeys for this test
    const result2of3 = createP2TRMultisig(TEST_PUBKEYS, 2, 'bitcoin-mainnet');
    const result3of3 = createP2TRMultisig(TEST_PUBKEYS, 3, 'bitcoin-mainnet');
    
    expect(result2of3.address).not.toBe(result3of3.address);
  });
  
  test('each leaf has script data', () => {
    const result = createP2TRMultisig(TEST_PUBKEYS, 2, 'bitcoin-mainnet');
    
    for (const leaf of result.leaves) {
      // Script should be present
      expect(leaf.script.length).toBeGreaterThan(0);
      // Signer indices should be present  
      expect(leaf.signerIndices.length).toBe(2);
    }
    
    // Control blocks are computed at signing time, so they may be empty here
    // This is intentional - we compute them when building the witness
  });
});

describe('Pubkey Conversion', () => {
  test('passes through x-only pubkey', () => {
    const xOnly = TEST_PUBKEYS[0];
    expect(compressedToXOnly(xOnly)).toBe(xOnly);
  });
  
  test('strips prefix from compressed pubkey', () => {
    const xOnly = TEST_PUBKEYS[0];
    const compressed = '02' + xOnly;
    expect(compressedToXOnly(compressed)).toBe(xOnly);
  });
  
  test('works with 03 prefix too', () => {
    const xOnly = TEST_PUBKEYS[0];
    const compressed = '03' + xOnly;
    expect(compressedToXOnly(compressed)).toBe(xOnly);
  });
  
  test('throws on invalid length', () => {
    expect(() => compressedToXOnly('abc')).toThrow();
    expect(() => compressedToXOnly('a'.repeat(68))).toThrow();
  });
});
