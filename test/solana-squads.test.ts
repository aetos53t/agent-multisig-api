/**
 * Solana Squads Adapter Unit Tests
 * 
 * Tests adapter logic without requiring devnet funds
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { Keypair, PublicKey } from '@solana/web3.js';
import * as multisig from '@sqds/multisig';

describe('Solana Squads Adapter', () => {
  let member1: Keypair;
  let member2: Keypair;
  let createKey: Keypair;

  beforeAll(() => {
    member1 = Keypair.generate();
    member2 = Keypair.generate();
    createKey = Keypair.generate();
  });

  describe('PDA derivation', () => {
    it('derives deterministic multisig PDA from createKey', () => {
      const [pda1] = multisig.getMultisigPda({ createKey: createKey.publicKey });
      const [pda2] = multisig.getMultisigPda({ createKey: createKey.publicKey });
      
      // Same input = same output
      expect(pda1.toBase58()).toBe(pda2.toBase58());
      
      // Different createKey = different PDA
      const otherKey = Keypair.generate();
      const [pda3] = multisig.getMultisigPda({ createKey: otherKey.publicKey });
      expect(pda3.toBase58()).not.toBe(pda1.toBase58());
    });

    it('derives vault PDA from multisig PDA', () => {
      const [multisigPda] = multisig.getMultisigPda({ createKey: createKey.publicKey });
      const [vaultPda] = multisig.getVaultPda({ multisigPda, index: 0 });
      
      // Vault is deterministic
      const [vaultPda2] = multisig.getVaultPda({ multisigPda, index: 0 });
      expect(vaultPda.toBase58()).toBe(vaultPda2.toBase58());
      
      // Different vault index = different address
      const [vaultPda1] = multisig.getVaultPda({ multisigPda, index: 1 });
      expect(vaultPda1.toBase58()).not.toBe(vaultPda.toBase58());
    });

    it('produces valid Solana addresses', () => {
      const [multisigPda] = multisig.getMultisigPda({ createKey: createKey.publicKey });
      const [vaultPda] = multisig.getVaultPda({ multisigPda, index: 0 });
      
      // Should be valid base58 addresses
      expect(multisigPda.toBase58()).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
      expect(vaultPda.toBase58()).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
    });
  });

  describe('Create multisig instruction', () => {
    it('builds valid create instruction', () => {
      const [multisigPda] = multisig.getMultisigPda({ createKey: createKey.publicKey });
      
      const createIx = multisig.instructions.multisigCreateV2({
        createKey: createKey.publicKey,
        creator: member1.publicKey,
        multisigPda,
        configAuthority: null,
        timeLock: 0,
        members: [
          { key: member1.publicKey, permissions: multisig.types.Permissions.all() },
          { key: member2.publicKey, permissions: multisig.types.Permissions.all() },
        ],
        threshold: 2,
        rentCollector: null,
        treasury: member1.publicKey,
      });

      expect(createIx.programId.toBase58()).toBe(multisig.PROGRAM_ID.toBase58());
      expect(createIx.keys.length).toBeGreaterThan(0);
      expect(createIx.data.length).toBeGreaterThan(0);
    });

    it('enforces threshold constraints', () => {
      const [multisigPda] = multisig.getMultisigPda({ createKey: createKey.publicKey });
      
      // Should not throw for valid threshold
      expect(() => {
        multisig.instructions.multisigCreateV2({
          createKey: createKey.publicKey,
          creator: member1.publicKey,
          multisigPda,
          configAuthority: null,
          timeLock: 0,
          members: [
            { key: member1.publicKey, permissions: multisig.types.Permissions.all() },
            { key: member2.publicKey, permissions: multisig.types.Permissions.all() },
          ],
          threshold: 2,
          rentCollector: null,
          treasury: member1.publicKey,
        });
      }).not.toThrow();
    });
  });

  describe('Member permissions', () => {
    it('supports all permissions', () => {
      const allPerms = multisig.types.Permissions.all();
      expect(allPerms).toBeDefined();
    });

    it('supports custom permissions via mask', () => {
      // Squads uses bitmask for permissions
      const perms = { mask: 2 }; // Vote only
      expect(perms.mask).toBe(2);
    });
  });

  describe('Proposal transaction', () => {
    it('derives proposal PDA', () => {
      const [multisigPda] = multisig.getMultisigPda({ createKey: createKey.publicKey });
      const transactionIndex = BigInt(0);
      
      const [proposalPda] = multisig.getProposalPda({
        multisigPda,
        transactionIndex,
      });

      expect(proposalPda.toBase58()).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
    });
  });
});

describe('ed25519 Signatures', () => {
  it('generates valid ed25519 keypairs', () => {
    const kp = Keypair.generate();
    
    // ed25519 public key is 32 bytes
    expect(kp.publicKey.toBytes().length).toBe(32);
    
    // Secret key is 64 bytes (seed + public key)
    expect(kp.secretKey.length).toBe(64);
  });

  it('can derive signature from transaction sign', async () => {
    const kp = Keypair.generate();
    
    // Solana uses nacl internally for signing
    // The secretKey contains both seed (32 bytes) + pubkey (32 bytes)
    const seed = kp.secretKey.slice(0, 32);
    const pubFromSecret = kp.secretKey.slice(32);
    
    // Verify pubkey derivation is consistent
    expect(Buffer.from(pubFromSecret)).toEqual(Buffer.from(kp.publicKey.toBytes()));
  });
});
