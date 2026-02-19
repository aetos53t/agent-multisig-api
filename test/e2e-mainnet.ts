/**
 * End-to-end test against live API with real Bitcoin
 * 
 * This test validates the complete flow:
 * 1. Register 3 agents
 * 2. Create 2-of-3 multisig
 * 3. (Manual) Fund the address
 * 4. Create spend proposal
 * 5. Sign with 2 agents
 * 6. Finalize and broadcast
 * 
 * Prerequisites:
 * - API running locally or on Railway
 * - For actual broadcast: fund the multisig address
 */

import { schnorr } from '@noble/curves/secp256k1';
import { hex } from '@scure/base';
import { randomBytes } from 'crypto';

const API_URL = process.env.API_URL || 'https://agent-multisig-api-production.up.railway.app';

// ═══════════════════════════════════════════════════════════════════
//                          HELPERS
// ═══════════════════════════════════════════════════════════════════

async function api(method: string, path: string, body?: any) {
  // Routes are under /v1 except /health
  const prefix = path === '/health' ? '' : '/v1';
  const url = `${API_URL}${prefix}${path}`;
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) {
    console.error('API Error:', data);
    throw new Error(data.error?.message || 'API request failed');
  }
  return data;
}

function generateKeypair() {
  const privateKey = randomBytes(32);
  const publicKey = schnorr.getPublicKey(privateKey);
  return {
    privateKey: hex.encode(privateKey),
    publicKey: hex.encode(publicKey),
  };
}

// ═══════════════════════════════════════════════════════════════════
//                          MAIN TEST
// ═══════════════════════════════════════════════════════════════════

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║       END-TO-END TEST: Agent Multisig Coordination API        ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log();
  console.log(`API: ${API_URL}`);
  console.log();

  // Health check
  console.log('1. Health check...');
  const health = await api('GET', '/health');
  console.log('   ✓ API is healthy:', health.status);
  console.log();

  // Generate 3 keypairs
  console.log('2. Generating keypairs...');
  const agents = [
    { name: 'AGENT_ALPHA', ...generateKeypair() },
    { name: 'AGENT_BETA', ...generateKeypair() },
    { name: 'AGENT_GAMMA', ...generateKeypair() },
  ];
  
  for (const a of agents) {
    console.log(`   ${a.name}:`);
    console.log(`     Private: ${a.privateKey}`);
    console.log(`     Public:  ${a.publicKey}`);
  }
  console.log();

  // Register agents
  console.log('3. Registering agents...');
  const registeredAgents = [];
  for (const a of agents) {
    const res = await api('POST', '/agents', {
      name: a.name,
      publicKey: a.publicKey,
      provider: 'custom',
    });
    registeredAgents.push({ ...a, id: res.data.id });
    console.log(`   ✓ ${a.name} registered: ${res.data.id}`);
  }
  console.log();

  // Create 2-of-3 multisig
  console.log('4. Creating 2-of-3 multisig...');
  const multisigRes = await api('POST', '/multisigs', {
    name: 'E2E Test Treasury',
    chainId: 'bitcoin-mainnet',
    threshold: 2,
    agents: registeredAgents.map(a => ({
      id: a.id,
      name: a.name,
      publicKey: a.publicKey,
      provider: 'custom',
    })),
  });
  
  const multisig = multisigRes.data;
  console.log('   ✓ Created multisig:', multisig.id);
  console.log('   ✓ Address:', multisig.address);
  console.log();

  // Check balance
  console.log('5. Checking balance...');
  const balanceRes = await api('GET', `/multisigs/${multisig.id}`);
  const balance = balanceRes.data.balance;
  console.log(`   Confirmed: ${balance?.confirmed || 0} sats`);
  console.log(`   Unconfirmed: ${balance?.unconfirmed || 0} sats`);
  console.log();

  if (BigInt(balance?.confirmed || 0) === 0n) {
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║  FUND THE ADDRESS TO CONTINUE                                  ║');
    console.log('╠════════════════════════════════════════════════════════════════╣');
    console.log(`║  ${multisig.address}  ║`);
    console.log('║  Send at least 10,000 sats                                     ║');
    console.log('╚════════════════════════════════════════════════════════════════╝');
    console.log();
    console.log('Keys saved to /tmp/e2e-test-keys.json');
    
    // Save keys for later
    const fs = await import('fs');
    fs.writeFileSync('/tmp/e2e-test-keys.json', JSON.stringify({
      multisig,
      agents: registeredAgents,
    }, null, 2));
    
    return;
  }

  // Create proposal
  console.log('6. Creating spend proposal...');
  const proposalRes = await api('POST', '/proposals', {
    multisigId: multisig.id,
    outputs: [
      {
        address: 'bc1qpzlw29z50cz7ysjpsaqggtscya3p6ggehnsp2g', // Return address
        amount: '10000',
      },
    ],
  });
  
  const proposal = proposalRes.data;
  console.log('   ✓ Created proposal:', proposal.id);
  console.log('   ✓ Sighash:', proposal.sighashes?.[0]?.sighash?.slice(0, 16) + '...');
  console.log();

  // Sign with ALPHA
  console.log('7. Signing with ALPHA...');
  const sighash = hex.decode(proposal.sighashes[0].sighash);
  const alphaSig = schnorr.sign(sighash, hex.decode(registeredAgents[0].privateKey));
  
  const signRes1 = await api('POST', `/proposals/${proposal.id}/sign`, {
    agentId: registeredAgents[0].id,
    signature: hex.encode(alphaSig),
  });
  console.log('   ✓ ALPHA signed. Count:', signRes1.data.signatureCount);
  console.log();

  // Sign with BETA
  console.log('8. Signing with BETA...');
  const betaSig = schnorr.sign(sighash, hex.decode(registeredAgents[1].privateKey));
  
  const signRes2 = await api('POST', `/proposals/${proposal.id}/sign`, {
    agentId: registeredAgents[1].id,
    signature: hex.encode(betaSig),
  });
  console.log('   ✓ BETA signed. Count:', signRes2.data.signatureCount);
  console.log('   ✓ Threshold met:', signRes2.data.thresholdMet);
  console.log();

  // Finalize
  console.log('9. Finalizing...');
  const finalizeRes = await api('POST', `/proposals/${proposal.id}/finalize`);
  console.log('   ✓ Finalized. Txid:', finalizeRes.data.txid);
  console.log();

  // Broadcast
  console.log('10. Broadcasting...');
  const broadcastRes = await api('POST', `/proposals/${proposal.id}/broadcast`);
  console.log('   ✓ Broadcast success!');
  console.log('   ✓ Txid:', broadcastRes.data.txid);
  console.log('   ✓ Explorer:', broadcastRes.data.explorerUrl);
  console.log();

  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║                    TEST COMPLETE ✓                             ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
}

main().catch(console.error);
