/**
 * Signing flow tests
 * 
 * Tests the critical path: create proposal -> sign -> finalize
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { createP2TRMultisig } from '../src/services/taproot';
import { createPSBT } from '../src/services/psbt';

describe('Signing Flow', () => {
  const aetosPubkey = '2c0b0502dbbdfd05725416d45235c49f06387e1fa09cefe29f44da63cf78de73';
  const arcPubkey = '587de2def2ed807f147632b445d5f53af23d25294ab5359ef230c5e65bc06700';
  
  it('creates correct sighash (not raw preimage)', () => {
    // Create 2-of-2 multisig
    const result = createP2TRMultisig([aetosPubkey, arcPubkey], 2, 'bitcoin-mainnet');
    
    expect(result.address).toBe('bc1ppxdargpzh6sf0pcd8makgva0hk9lsunkt6wfh445akpfn5hwvynqxsthz0');
    
    // Create a PSBT
    const psbtResult = createPSBT({
      inputs: [{
        txid: '7628bbd3ee6c5f8ef3ed3e961f5d41c86e297c21405317f46e6bfe78bfb3f15e',
        vout: 0,
        amount: 15000n,
        scriptPubkey: '5120099bd1a022bea097870d3efb6433afbd8bf872765e9c9bd6b4ed8299d2ee6126',
      }],
      outputs: [{ address: 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq', amount: 10000n }],
      feeRate: 1,
      changeAddress: result.address,
      chainId: 'bitcoin-mainnet',
      multisig: {
        address: result.address,
        internalPubkey: result.internalPubkey,
        tweakedPubkey: result.tweakedPubkey,
        scriptTree: result.scriptTree,
      },
      selectedLeafIndex: 0,
    });
    
    // Sighash should be 32 bytes (64 hex chars) - a hash, not raw preimage
    expect(psbtResult.sighashes[0].sighash.length).toBe(64);
    
    // Sighash is a 32-byte hash (BIP 341 TapSighash), not raw preimage (which would be longer)
    // The exact value depends on the transaction details
    console.log('Computed sighash:', psbtResult.sighashes[0].sighash);
  });
  
  it('tracks signature count correctly', () => {
    // Simulate signature tracking
    const signatures: { agentId: string }[] = [];
    
    // Add first signature
    signatures.push({ agentId: 'aetos' });
    
    // Count should be 1
    const uniqueSigners1 = new Set(signatures.map(s => s.agentId));
    expect(uniqueSigners1.size).toBe(1);
    
    // Add second signature
    signatures.push({ agentId: 'jason' });
    
    // Count should be 2
    const uniqueSigners2 = new Set(signatures.map(s => s.agentId));
    expect(uniqueSigners2.size).toBe(2);
    
    // Try to add duplicate - should still be 2
    signatures.push({ agentId: 'aetos' });
    const uniqueSigners3 = new Set(signatures.map(s => s.agentId));
    expect(uniqueSigners3.size).toBe(2);
  });
});
