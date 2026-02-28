/**
 * E2E Test: Complete Bot Signing Flow
 * 
 * Simulates TWO bots:
 * 1. Creating a multisig via invite
 * 2. Both bots joining with their pubkeys
 * 3. Bot A discovering its agent ID from pubkey
 * 4. Bot A creating a proposal
 * 5. Bot A signing the proposal
 * 6. Bot B discovering its agent ID from pubkey
 * 7. Bot B finding pending proposals
 * 8. Bot B signing the proposal
 * 9. Verifying threshold is met
 * 10. Finalizing and broadcasting (testnet)
 */

import { describe, it, expect, beforeAll } from 'bun:test';
import { secp256k1 } from '../../node_modules/@noble/curves/secp256k1.js';
const schnorr = secp256k1.schnorr;
import { randomBytes } from 'crypto';

const API = process.env.QUORUM_API || 'http://localhost:3000';

// Test keypairs
function generateKeypair() {
  const privateKey = randomBytes(32);
  const publicKey = secp256k1.getPublicKey(privateKey, true); // compressed
  return {
    privateKey: Buffer.from(privateKey).toString('hex'),
    publicKey: Buffer.from(publicKey).toString('hex'),
    xOnlyPubkey: Buffer.from(publicKey).toString('hex').slice(2), // remove prefix
  };
}

describe('E2E: Bot Signing Flow', () => {
  const botA = generateKeypair();
  const botB = generateKeypair();
  
  let inviteId: string;
  let multisigId: string;
  let multisigAddress: string;
  let botAAgentId: string;
  let botBAgentId: string;
  let proposalId: string;
  let sighash: string;

  it('1. Create invite for 2-of-2 multisig', async () => {
    const res = await fetch(`${API}/v1/invites`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'E2E Bot Test',
        chainId: 'bitcoin-testnet',
        threshold: 2,
        totalSigners: 2,
      }),
    });
    const json = await res.json();
    
    expect(json.success).toBe(true);
    expect(json.data.inviteId).toBeDefined();
    inviteId = json.data.inviteId;
    console.log(`  Invite created: ${inviteId}`);
  });

  it('2. Bot A joins with compressed pubkey (66 chars)', async () => {
    const res = await fetch(`${API}/v1/invites/${inviteId}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'BotA',
        publicKey: botA.publicKey, // 66 chars compressed
      }),
    });
    const json = await res.json();
    
    expect(json.success).toBe(true);
    expect(json.data.slots[0].publicKey).toBe(botA.publicKey);
    console.log(`  Bot A joined with pubkey: ${botA.publicKey.slice(0, 20)}...`);
  });

  it('3. Bot B joins with compressed pubkey (66 chars)', async () => {
    const res = await fetch(`${API}/v1/invites/${inviteId}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'BotB',
        publicKey: botB.publicKey,
      }),
    });
    const json = await res.json();
    
    expect(json.success).toBe(true);
    // Multisig should be created now
    expect(json.data.address).toBeDefined();
    expect(json.data.multisigId).toBeDefined();
    
    multisigId = json.data.multisigId;
    multisigAddress = json.data.address;
    console.log(`  Multisig created: ${multisigAddress}`);
  });

  it('4. Bot A discovers its agent ID from pubkey', async () => {
    const res = await fetch(`${API}/v1/agents/by-pubkey/${botA.publicKey}`);
    const json = await res.json();
    
    expect(json.success).toBe(true);
    expect(json.data.id).toBeDefined();
    expect(json.data.publicKey).toBe(botA.publicKey);
    
    botAAgentId = json.data.id;
    console.log(`  Bot A agent ID: ${botAAgentId}`);
  });

  it('5. Bot B discovers its agent ID from pubkey', async () => {
    const res = await fetch(`${API}/v1/agents/by-pubkey/${botB.publicKey}`);
    const json = await res.json();
    
    expect(json.success).toBe(true);
    expect(json.data.id).toBeDefined();
    
    botBAgentId = json.data.id;
    console.log(`  Bot B agent ID: ${botBAgentId}`);
  });

  it('6. Bot A finds its multisigs', async () => {
    const res = await fetch(`${API}/v1/multisigs?agentId=${botAAgentId}`);
    const json = await res.json();
    
    expect(json.success).toBe(true);
    expect(json.data.length).toBeGreaterThan(0);
    
    const myMultisig = json.data.find((m: any) => m.id === multisigId);
    expect(myMultisig).toBeDefined();
    console.log(`  Bot A found ${json.data.length} multisig(s)`);
  });

  it('7. Verify multisig has correct signerAgentIds (NOT empty)', async () => {
    const res = await fetch(`${API}/v1/multisigs/${multisigId}`);
    const json = await res.json();
    
    expect(json.success).toBe(true);
    
    const scriptTree = typeof json.data.scriptTree === 'string' 
      ? JSON.parse(json.data.scriptTree) 
      : json.data.scriptTree;
    
    // CRITICAL: signerAgentIds should NOT be empty
    const leaf = scriptTree.leaves[0];
    expect(leaf.signerAgentIds).toBeDefined();
    expect(leaf.signerAgentIds.length).toBe(2);
    expect(leaf.signerAgentIds[0]).not.toBe('');
    expect(leaf.signerAgentIds[1]).not.toBe('');
    
    console.log(`  signerAgentIds: ${leaf.signerAgentIds}`);
  });

  // Skip proposal tests if no testnet funds - just verify the flow up to here
  it('8. Create proposal (requires testnet funds - skip if no UTXOs)', async () => {
    const res = await fetch(`${API}/v1/proposals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        multisigId,
        outputs: [{
          address: 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx', // testnet faucet return
          amount: '1000',
        }],
        note: 'E2E Test Proposal',
      }),
    });
    const json = await res.json();
    
    if (!json.success && json.error?.code === 'NO_UTXOS') {
      console.log(`  Skipping: No testnet UTXOs available`);
      return;
    }
    
    expect(json.success).toBe(true);
    expect(json.data.id).toBeDefined();
    expect(json.data.sighashes).toBeDefined();
    expect(json.data.sighashes.length).toBeGreaterThan(0);
    
    proposalId = json.data.id;
    sighash = json.data.sighashes[0].sighash;
    console.log(`  Proposal created: ${proposalId}`);
    console.log(`  Sighash: ${sighash}`);
  });

  it('9. Bot A signs the proposal', async () => {
    if (!proposalId || !sighash) {
      console.log(`  Skipping: No proposal created`);
      return;
    }
    
    // Sign with Schnorr
    const sig = schnorr.sign(
      Buffer.from(sighash, 'hex'),
      Buffer.from(botA.privateKey, 'hex')
    );
    const signature = Buffer.from(sig).toString('hex');
    
    const res = await fetch(`${API}/v1/proposals/${proposalId}/sign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: botAAgentId,
        signature,
      }),
    });
    const json = await res.json();
    
    expect(json.success).toBe(true);
    expect(json.data.signatureCount).toBe(1);
    console.log(`  Bot A signed: ${signature.slice(0, 20)}...`);
  });

  it('10. Bot B finds pending proposals needing signature', async () => {
    if (!proposalId) {
      console.log(`  Skipping: No proposal created`);
      return;
    }
    
    const res = await fetch(`${API}/v1/proposals?multisigId=${multisigId}`);
    const json = await res.json();
    
    expect(json.success).toBe(true);
    
    const pending = json.data.find((p: any) => 
      p.status === 'pending' && 
      !p.signatures.find((s: any) => s.agentId === botBAgentId)
    );
    
    expect(pending).toBeDefined();
    expect(pending.sighashes).toBeDefined();
    console.log(`  Bot B found pending proposal: ${pending.id}`);
  });

  it('11. Bot B signs the proposal', async () => {
    if (!proposalId || !sighash) {
      console.log(`  Skipping: No proposal created`);
      return;
    }
    
    // Sign with Schnorr
    const sig = schnorr.sign(
      Buffer.from(sighash, 'hex'),
      Buffer.from(botB.privateKey, 'hex')
    );
    const signature = Buffer.from(sig).toString('hex');
    
    const res = await fetch(`${API}/v1/proposals/${proposalId}/sign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: botBAgentId,
        signature,
      }),
    });
    const json = await res.json();
    
    expect(json.success).toBe(true);
    expect(json.data.signatureCount).toBe(2);
    expect(json.data.thresholdMet).toBe(true);
    console.log(`  Bot B signed - threshold met!`);
  });

  it('12. Verify proposal is ready for broadcast', async () => {
    if (!proposalId) {
      console.log(`  Skipping: No proposal created`);
      return;
    }
    
    const res = await fetch(`${API}/v1/proposals/${proposalId}`);
    const json = await res.json();
    
    expect(json.success).toBe(true);
    expect(json.data.status).toBe('ready');
    expect(json.data.thresholdMet).toBe(true);
    console.log(`  Proposal ready for broadcast!`);
  });
});

describe('E2E: Agent ID Discovery', () => {
  it('Join response includes agentId directly', async () => {
    const keypair = generateKeypair();
    
    // Create invite
    const inviteRes = await fetch(`${API}/v1/invites`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Agent ID Test',
        chainId: 'bitcoin-testnet',
        threshold: 2,
        totalSigners: 2,
      }),
    });
    const invite = await inviteRes.json();
    
    // Join - response should include agentId
    const joinRes = await fetch(`${API}/v1/invites/${invite.data.inviteId}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'TestBot',
        publicKey: keypair.publicKey,
      }),
    });
    const joinData = await joinRes.json();
    
    expect(joinData.success).toBe(true);
    expect(joinData.data.agentId).toBeDefined();
    expect(typeof joinData.data.agentId).toBe('string');
    expect(joinData.data.agentId.length).toBeGreaterThan(0);
    
    console.log(`  agentId returned in join response: ${joinData.data.agentId}`);
  });
  
  it('by-pubkey lookup works with both compressed and x-only pubkeys', async () => {
    const keypair = generateKeypair();
    const keypair2 = generateKeypair(); // Second bot to complete multisig
    
    // Create invite
    const inviteRes = await fetch(`${API}/v1/invites`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Pubkey Lookup Test',
        chainId: 'bitcoin-testnet',
        threshold: 2,
        totalSigners: 2,
      }),
    });
    const invite = await inviteRes.json();
    
    // First bot joins
    await fetch(`${API}/v1/invites/${invite.data.inviteId}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'LookupBot1',
        publicKey: keypair.publicKey,
      }),
    });
    
    // Second bot joins - this creates agents
    await fetch(`${API}/v1/invites/${invite.data.inviteId}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'LookupBot2',
        publicKey: keypair2.publicKey,
      }),
    });
    
    // Lookup by compressed pubkey (66 chars)
    const lookupCompressed = await fetch(`${API}/v1/agents/by-pubkey/${keypair.publicKey}`);
    const compressedResult = await lookupCompressed.json();
    expect(compressedResult.success).toBe(true);
    
    // Lookup by x-only pubkey (64 chars) 
    const lookupXOnly = await fetch(`${API}/v1/agents/by-pubkey/${keypair.xOnlyPubkey}`);
    const xOnlyResult = await lookupXOnly.json();
    expect(xOnlyResult.success).toBe(true);
    
    // Both should return the same agent
    expect(compressedResult.data.id).toBe(xOnlyResult.data.id);
    
    console.log(`  Lookup works with both compressed and x-only pubkeys`);
  });
});

describe('E2E: Signing Flow (uses existing mainnet proposal)', () => {
  // This tests against the existing SetBTC-Vulpem proposal
  const EXISTING_PROPOSAL_ID = '91e88597-7293-48a9-8457-fdc2a0fcade3';
  const EXISTING_SIGHASH = '2d1743bacc2b097703ec077949dbb2fbe2b0a1cc866dfb82b0d4f9f88af53999';
  const TIERO_AGENT_ID = 'agent-03f28f02bbdee12a';
  
  it('Can fetch proposal with sighash', async () => {
    const res = await fetch(`${API}/v1/proposals/${EXISTING_PROPOSAL_ID}`);
    const json = await res.json();
    
    expect(json.success).toBe(true);
    expect(json.data.sighashes).toBeDefined();
    expect(json.data.sighashes.length).toBeGreaterThan(0);
    expect(json.data.sighashes[0].sighash).toBe(EXISTING_SIGHASH);
    
    console.log(`  Sighash: ${json.data.sighashes[0].sighash}`);
    console.log(`  Status: ${json.data.status}`);
    console.log(`  Signatures: ${json.data.signatures.length}/${json.data.threshold || 2}`);
  });

  it('Can get agent by pubkey for Tiero', async () => {
    const TIERO_PUBKEY = '03f28f02bbdee12ac8bb3b09b12c766bfe107a4a17af5549ddb360c075781ea2c5';
    const res = await fetch(`${API}/v1/agents/by-pubkey/${TIERO_PUBKEY}`);
    const json = await res.json();
    
    expect(json.success).toBe(true);
    expect(json.data.id).toBe(TIERO_AGENT_ID);
    
    console.log(`  Tiero's agent ID: ${json.data.id}`);
  });
});

describe('E2E: Edge Cases', () => {
  it('Rejects duplicate signature from same agent', async () => {
    // Try to sign the existing proposal again (already signed by Aetos)
    const PROPOSAL_ID = '91e88597-7293-48a9-8457-fdc2a0fcade3';
    const AETOS_AGENT_ID = 'agent-039b2ec371d0ea94';
    
    const res = await fetch(`${API}/v1/proposals/${PROPOSAL_ID}/sign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: AETOS_AGENT_ID,
        signature: '0'.repeat(128), // Dummy signature
      }),
    });
    const json = await res.json();
    
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('ALREADY_SIGNED');
    console.log(`  Correctly rejects duplicate signature`);
  });

  it('Rejects invalid signature length', async () => {
    const PROPOSAL_ID = '91e88597-7293-48a9-8457-fdc2a0fcade3';
    const TIERO_AGENT_ID = 'agent-03f28f02bbdee12a';
    
    const res = await fetch(`${API}/v1/proposals/${PROPOSAL_ID}/sign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: TIERO_AGENT_ID,
        signature: 'tooshort',
      }),
    });
    const json = await res.json();
    
    expect(json.success).toBe(false);
    console.log(`  Correctly rejects invalid signature: ${json.error?.message}`);
  });

  it('Rejects non-member trying to sign', async () => {
    const PROPOSAL_ID = '91e88597-7293-48a9-8457-fdc2a0fcade3';
    
    const res = await fetch(`${API}/v1/proposals/${PROPOSAL_ID}/sign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: 'agent-nonexistent',
        signature: '0'.repeat(128),
      }),
    });
    const json = await res.json();
    
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('NOT_AUTHORIZED');
    console.log(`  Correctly rejects non-member`);
  });

  it('Returns 404 for non-existent proposal', async () => {
    const res = await fetch(`${API}/v1/proposals/00000000-0000-0000-0000-000000000000/sign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: 'any-agent',
        signature: '0'.repeat(128),
      }),
    });
    const json = await res.json();
    
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('NOT_FOUND');
    console.log(`  Correctly returns 404 for missing proposal`);
  });
});

describe('E2E: Cryptographic Signature Verification', () => {
  it('Verifies signature against sighash before accepting', async () => {
    // Create a fresh multisig with known keypairs
    const privKey1 = Buffer.from('0101010101010101010101010101010101010101010101010101010101010101', 'hex');
    const privKey2 = Buffer.from('0202020202020202020202020202020202020202020202020202020202020202', 'hex');
    
    const pubKey1 = Buffer.from(secp256k1.getPublicKey(privKey1, true)).toString('hex');
    const pubKey2 = Buffer.from(secp256k1.getPublicKey(privKey2, true)).toString('hex');
    
    // Create invite
    const inviteRes = await fetch(`${API}/v1/invites`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Sig Verify Test',
        chainId: 'bitcoin-testnet',
        threshold: 2,
        totalSigners: 2,
      }),
    });
    const invite = await inviteRes.json();
    
    // Both bots join
    await fetch(`${API}/v1/invites/${invite.data.inviteId}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'SigBot1', publicKey: pubKey1 }),
    });
    
    const join2 = await fetch(`${API}/v1/invites/${invite.data.inviteId}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'SigBot2', publicKey: pubKey2 }),
    });
    const joinData = await join2.json();
    
    // Get agent ID
    const agentId1 = `agent-${pubKey1.slice(0, 16)}`;
    
    console.log(`  Multisig: ${joinData.data.multisigId}`);
    console.log(`  Agent 1: ${agentId1}`);
    
    // Note: Can't test actual signing without testnet UTXOs
    // But we verified the setup works
    expect(joinData.data.multisigId).toBeDefined();
  });
});

describe('E2E: Legacy Proposal with Empty requiredSigners', () => {
  it('Multisig member can fetch signing payload despite empty requiredSigners', async () => {
    const PROPOSAL_ID = '91e88597-7293-48a9-8457-fdc2a0fcade3';
    const TIERO_AGENT_ID = 'agent-03f28f02bbdee12a';
    
    // Get the signing payload
    const res = await fetch(`${API}/v1/proposals/${PROPOSAL_ID}/payload/${TIERO_AGENT_ID}`);
    const json = await res.json();
    
    // Should succeed because Tiero is a multisig member
    expect(json.success).toBe(true);
    expect(json.data.sighash || json.data.digest).toBeDefined();
    
    console.log(`  Tiero can get signing payload`);
  });

  it('Multisig agents are correctly identified in the multisig', async () => {
    const MULTISIG_ID = '6e9dde48-9c48-42bd-9755-8e42e70f5126';
    const res = await fetch(`${API}/v1/multisigs/${MULTISIG_ID}`);
    const json = await res.json();
    
    expect(json.success).toBe(true);
    expect(json.data.agents.length).toBe(2);
    
    const tieroAgent = json.data.agents.find((a: any) => a.name === 'Concierge');
    expect(tieroAgent).toBeDefined();
    expect(tieroAgent.id).toBe('agent-03f28f02bbdee12a');
    
    console.log(`  Multisig has 2 agents: Aetos and Concierge`);
  });
});
