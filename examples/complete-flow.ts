#!/usr/bin/env npx tsx
/**
 * Complete Agent Multisig Flow Example
 * 
 * Demonstrates the full lifecycle:
 * 1. Generate keypairs for 3 agents
 * 2. Register agents with the API
 * 3. Create a 2-of-3 multisig
 * 4. Fund the multisig (manual step)
 * 5. Create a spend proposal
 * 6. Sign with 2 agents
 * 7. Finalize and broadcast
 * 
 * Run: npx tsx examples/complete-flow.ts
 */

import { schnorr } from '@noble/curves/secp256k1';
import { hex } from '@scure/base';
import { randomBytes } from 'crypto';
import * as readline from 'readline';

// ═══════════════════════════════════════════════════════════════════
//                          CONFIG
// ═══════════════════════════════════════════════════════════════════

const API_URL = process.env.API_URL || 'https://agent-multisig-api-production.up.railway.app';
const NETWORK = process.env.NETWORK || 'bitcoin-mainnet';
const DESTINATION = process.env.DESTINATION || 'bc1qpzlw29z50cz7ysjpsaqggtscya3p6ggehnsp2g';

// ═══════════════════════════════════════════════════════════════════
//                          HELPERS
// ═══════════════════════════════════════════════════════════════════

async function api(method: string, path: string, body?: any) {
  const prefix = path === '/health' ? '' : '/v1';
  const res = await fetch(`${API_URL}${prefix}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || 'API error');
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

async function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

function printBox(title: string, content: string[]) {
  const width = 60;
  console.log('┌' + '─'.repeat(width) + '┐');
  console.log('│ ' + title.padEnd(width - 1) + '│');
  console.log('├' + '─'.repeat(width) + '┤');
  for (const line of content) {
    console.log('│ ' + line.slice(0, width - 2).padEnd(width - 1) + '│');
  }
  console.log('└' + '─'.repeat(width) + '┘');
}

// ═══════════════════════════════════════════════════════════════════
//                          MAIN FLOW
// ═══════════════════════════════════════════════════════════════════

async function main() {
  console.log('\n🔐 AGENT MULTISIG - COMPLETE FLOW EXAMPLE\n');

  // Step 1: Health check
  console.log('1️⃣  Checking API health...');
  const health = await api('GET', '/health');
  console.log(`   ✓ API status: ${health.status}\n`);

  // Step 2: Generate keypairs
  console.log('2️⃣  Generating keypairs for 3 agents...');
  const agents = [
    { name: 'TREASURY_BOT', ...generateKeypair() },
    { name: 'AUDIT_BOT', ...generateKeypair() },
    { name: 'BACKUP_BOT', ...generateKeypair() },
  ];

  for (const a of agents) {
    console.log(`   ${a.name}:`);
    console.log(`     Public:  ${a.publicKey.slice(0, 16)}...`);
  }
  console.log();

  // Step 3: Register agents
  console.log('3️⃣  Registering agents...');
  const registeredAgents = [];
  for (const a of agents) {
    const res = await api('POST', '/agents', {
      name: a.name,
      publicKey: a.publicKey,
      provider: 'custom',
    });
    registeredAgents.push({ ...a, id: res.data.id });
    console.log(`   ✓ ${a.name}: ${res.data.id}`);
  }
  console.log();

  // Step 4: Create multisig
  console.log('4️⃣  Creating 2-of-3 multisig...');
  const multisigRes = await api('POST', '/multisigs', {
    name: 'Example Treasury',
    chainId: NETWORK,
    threshold: 2,
    agents: registeredAgents.map(a => ({
      id: a.id,
      name: a.name,
      publicKey: a.publicKey,
      provider: 'custom',
    })),
  });

  const multisig = multisigRes.data;
  console.log(`   ✓ Multisig ID: ${multisig.id}`);
  console.log(`   ✓ Address: ${multisig.address}\n`);

  // Step 5: Check balance
  console.log('5️⃣  Checking balance...');
  const balanceRes = await api('GET', `/multisigs/${multisig.id}`);
  const confirmed = BigInt(balanceRes.data.balance?.confirmed || 0);
  console.log(`   Confirmed: ${confirmed} sats\n`);

  if (confirmed === 0n) {
    printBox('💰 FUND THE MULTISIG TO CONTINUE', [
      '',
      `Address: ${multisig.address}`,
      '',
      'Send at least 10,000 sats',
      '',
      'Then run this script again with:',
      `MULTISIG_ID=${multisig.id}`,
      '',
    ]);

    // Save state for resume
    const state = { multisig, agents: registeredAgents };
    const fs = await import('fs');
    fs.writeFileSync('/tmp/multisig-example-state.json', JSON.stringify(state, null, 2));
    console.log('\nState saved to /tmp/multisig-example-state.json');
    console.log('Resume after funding with: RESUME=1 npx tsx examples/complete-flow.ts\n');
    return;
  }

  // Step 6: Create proposal
  console.log('6️⃣  Creating spend proposal...');
  const amount = Math.min(Number(confirmed) - 500, 10000); // Leave fee buffer
  
  const proposalRes = await api('POST', '/proposals', {
    multisigId: multisig.id,
    outputs: [{ address: DESTINATION, amount: amount.toString() }],
  });

  const proposal = proposalRes.data;
  console.log(`   ✓ Proposal ID: ${proposal.id}`);
  console.log(`   ✓ Amount: ${amount} sats to ${DESTINATION.slice(0, 20)}...`);
  console.log(`   ✓ Fee: ${proposal.fee} sats\n`);

  // Step 7: Sign with first two agents
  console.log('7️⃣  Signing with TREASURY_BOT and AUDIT_BOT...\n');

  const sighash = hex.decode(proposal.sighashes[0].sighash);

  for (let i = 0; i < 2; i++) {
    const agent = registeredAgents[i];
    console.log(`   Signing with ${agent.name}...`);
    
    const signature = schnorr.sign(sighash, hex.decode(agent.privateKey));
    
    const signRes = await api('POST', `/proposals/${proposal.id}/sign`, {
      agentId: agent.id,
      signature: hex.encode(signature),
    });
    
    console.log(`   ✓ Signature ${i + 1}/2 submitted`);
    console.log(`   ✓ Status: ${signRes.data.status}`);
    console.log(`   ✓ Threshold met: ${signRes.data.thresholdMet}\n`);
  }

  // Step 8: Finalize
  console.log('8️⃣  Finalizing transaction...');
  const finalizeRes = await api('POST', `/proposals/${proposal.id}/finalize`);
  console.log(`   ✓ Txid: ${finalizeRes.data.txid}`);
  console.log(`   ✓ Size: ${finalizeRes.data.vsize} vB\n`);

  // Step 9: Broadcast
  console.log('9️⃣  Broadcasting to network...');
  const broadcastRes = await api('POST', `/proposals/${proposal.id}/broadcast`);
  
  printBox('✅ TRANSACTION BROADCAST!', [
    '',
    `Txid: ${broadcastRes.data.txid}`,
    '',
    `Explorer: ${broadcastRes.data.explorerUrl}`,
    '',
    `Sent ${amount} sats to ${DESTINATION.slice(0, 30)}...`,
    '',
  ]);

  console.log('\n🎉 Complete flow executed successfully!\n');
}

// Run with resume support
async function run() {
  if (process.env.RESUME) {
    const fs = await import('fs');
    try {
      const state = JSON.parse(fs.readFileSync('/tmp/multisig-example-state.json', 'utf8'));
      console.log('Resuming from saved state...');
      // TODO: Resume logic
    } catch {
      console.log('No saved state found. Starting fresh.');
    }
  }
  
  await main();
}

run().catch(console.error);
