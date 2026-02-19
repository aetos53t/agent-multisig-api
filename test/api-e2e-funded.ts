#!/usr/bin/env npx tsx
/**
 * API E2E Test - Requires Funded Address
 * 
 * Run after funding the multisig address shown in the previous test.
 * Loads state from /tmp/e2e-api-state.json
 * 
 * Usage: npx tsx test/api-e2e-funded.ts
 */

import { schnorr } from '@noble/curves/secp256k1';
import { hex } from '@scure/base';
import * as fs from 'fs';

const API = process.env.API_URL || 'https://agent-multisig-api-production.up.railway.app';

async function api(method: string, path: string, body?: any) {
  const prefix = path === '/health' ? '' : '/v1';
  const res = await fetch(`${API}${prefix}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

async function main() {
  console.log('🔐 API E2E TEST - FUNDED\n');
  console.log(`API: ${API}\n`);

  // Load state from previous run
  let state;
  try {
    state = JSON.parse(fs.readFileSync('/tmp/e2e-api-state.json', 'utf8'));
  } catch (e) {
    console.log('ERROR: No state file found. Run the initial test first.');
    console.log('  npx tsx test/e2e-mainnet.ts');
    return;
  }

  const { ms, agents } = state;
  console.log(`Multisig: ${ms.id}`);
  console.log(`Address: ${ms.address}`);
  console.log();

  // Check balance
  console.log('1. Checking balance...');
  const balRes = await api('GET', `/multisigs/${ms.id}`);
  
  if (!balRes.success) {
    console.log('ERROR: Multisig not found. API may have restarted (in-memory storage).');
    console.log('Re-run the initial test to recreate: npx tsx test/e2e-mainnet.ts');
    return;
  }

  const confirmed = BigInt(balRes.data?.balance?.confirmed || 0);
  console.log(`   Confirmed: ${confirmed} sats`);

  if (confirmed < 10000n) {
    console.log('\n   ⚠️ Need at least 10,000 sats. Fund the address:');
    console.log(`   ${ms.address}`);
    return;
  }

  console.log('   ✓ Sufficient balance\n');

  // Create proposal
  console.log('2. Creating proposal...');
  const amount = Math.min(Number(confirmed) - 500, 10000);
  const propRes = await api('POST', '/proposals', {
    multisigId: ms.id,
    outputs: [{ 
      address: 'bc1qpzlw29z50cz7ysjpsaqggtscya3p6ggehnsp2g',
      amount: amount.toString()
    }],
  });

  if (!propRes.success) {
    console.log('PROPOSAL ERROR:', propRes.error);
    return;
  }

  const proposal = propRes.data;
  console.log(`   ✓ ID: ${proposal.id}`);
  console.log(`   ✓ Amount: ${amount} sats`);
  console.log(`   ✓ Fee: ${proposal.fee} sats`);

  if (!proposal.sighashes?.[0]?.sighash) {
    console.log('ERROR: No sighash in response');
    console.log(JSON.stringify(proposal, null, 2));
    return;
  }

  const sighash = proposal.sighashes[0].sighash;
  console.log(`   ✓ Sighash: ${sighash.slice(0, 20)}...`);
  console.log();

  // Sign with first two agents
  console.log('3. Signing with Agent 0...');
  const sig0 = schnorr.sign(hex.decode(sighash), hex.decode(agents[0].priv));
  const sign0Res = await api('POST', `/proposals/${proposal.id}/sign`, {
    agentId: agents[0].id,
    signature: hex.encode(sig0),
  });

  if (!sign0Res.success) {
    console.log('SIGN ERROR:', sign0Res.error);
    return;
  }
  console.log(`   ✓ Signature 1/${sign0Res.data.threshold}`);
  console.log();

  console.log('4. Signing with Agent 1...');
  const sig1 = schnorr.sign(hex.decode(sighash), hex.decode(agents[1].priv));
  const sign1Res = await api('POST', `/proposals/${proposal.id}/sign`, {
    agentId: agents[1].id,
    signature: hex.encode(sig1),
  });

  if (!sign1Res.success) {
    console.log('SIGN ERROR:', sign1Res.error);
    return;
  }
  console.log(`   ✓ Signature 2/${sign1Res.data.threshold}`);
  console.log(`   ✓ Threshold met: ${sign1Res.data.thresholdMet}`);
  console.log();

  // Finalize
  console.log('5. Finalizing...');
  const finRes = await api('POST', `/proposals/${proposal.id}/finalize`);

  if (!finRes.success) {
    console.log('FINALIZE ERROR:', finRes.error);
    return;
  }
  console.log(`   ✓ Txid: ${finRes.data.txid}`);
  console.log(`   ✓ Size: ${finRes.data.vsize} vB`);
  console.log();

  // Broadcast
  console.log('6. Broadcasting...');
  const bcRes = await api('POST', `/proposals/${proposal.id}/broadcast`);

  if (!bcRes.success) {
    console.log('BROADCAST ERROR:', bcRes.error);
    return;
  }

  console.log('   ✓ BROADCAST SUCCESS!');
  console.log();
  console.log('═══════════════════════════════════════════════════════');
  console.log('   TRANSACTION CONFIRMED');
  console.log(`   Txid: ${bcRes.data.txid}`);
  console.log(`   ${bcRes.data.explorerUrl}`);
  console.log('═══════════════════════════════════════════════════════');
}

main().catch(console.error);
