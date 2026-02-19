#!/usr/bin/env npx tsx
/**
 * Escrow Service Example
 * 
 * Shows how to create an escrow between buyer, seller, and arbitrator.
 * 2-of-3 required to release funds.
 * 
 * Use case: Trustless agent-to-agent commerce
 */

import { schnorr } from '@noble/curves/secp256k1';
import { hex } from '@scure/base';
import { randomBytes } from 'crypto';

const API_URL = process.env.API_URL || 'https://agent-multisig-api-production.up.railway.app';

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

function generateParty(role: string) {
  const privateKey = randomBytes(32);
  const publicKey = schnorr.getPublicKey(privateKey);
  return {
    role,
    privateKey: hex.encode(privateKey),
    publicKey: hex.encode(publicKey),
  };
}

async function main() {
  console.log('🤝 ESCROW SERVICE EXAMPLE\n');

  // Generate parties
  const buyer = generateParty('BUYER_AGENT');
  const seller = generateParty('SELLER_AGENT');
  const arbitrator = generateParty('ARBITRATOR_AGENT');

  const parties = [buyer, seller, arbitrator];

  console.log('Escrow Parties:');
  console.log(`  Buyer:      ${buyer.publicKey.slice(0, 16)}...`);
  console.log(`  Seller:     ${seller.publicKey.slice(0, 16)}...`);
  console.log(`  Arbitrator: ${arbitrator.publicKey.slice(0, 16)}...`);
  console.log();

  // Register parties
  console.log('Registering parties...');
  const registered: any[] = [];
  for (const p of parties) {
    const res = await api('POST', '/agents', {
      name: p.role,
      publicKey: p.publicKey,
      provider: 'custom',
      metadata: { role: p.role },
    });
    registered.push({ ...p, id: res.data.id });
    console.log(`  ✓ ${p.role}`);
  }
  console.log();

  // Create escrow (2-of-3)
  console.log('Creating escrow multisig...');
  const escrowRes = await api('POST', '/multisigs', {
    name: 'Trade Escrow #' + Date.now().toString(36),
    chainId: 'bitcoin-mainnet',
    threshold: 2,
    agents: registered.map(r => ({
      id: r.id,
      name: r.role,
      publicKey: r.publicKey,
      provider: 'custom',
    })),
  });

  const escrow = escrowRes.data;
  console.log(`  ✓ Escrow address: ${escrow.address}`);
  console.log();

  // Show release scenarios
  console.log('📜 Release Scenarios:\n');
  
  console.log('  HAPPY PATH (trade succeeds):');
  console.log('    1. Buyer sends funds to escrow');
  console.log('    2. Seller delivers goods/service');
  console.log('    3. Buyer + Seller sign release to seller');
  console.log('    4. Transaction broadcasts (no arbitrator needed)');
  console.log();

  console.log('  DISPUTE (buyer unhappy):');
  console.log('    1. Buyer sends funds to escrow');
  console.log('    2. Seller claims delivery, buyer disagrees');
  console.log('    3. Arbitrator reviews evidence');
  console.log('    4. Arbitrator + Buyer sign refund');
  console.log('    5. OR Arbitrator + Seller sign release');
  console.log();

  console.log('  REFUND (seller no-show):');
  console.log('    1. Buyer sends funds to escrow');
  console.log('    2. Seller never delivers');
  console.log('    3. After timeout, Buyer + Arbitrator sign refund');
  console.log();

  console.log('💰 Escrow Address:');
  console.log(`   ${escrow.address}`);
  console.log();

  // Save state
  const fs = await import('fs');
  fs.writeFileSync('/tmp/escrow-state.json', JSON.stringify({
    escrow,
    parties: registered,
    buyerAddress: 'bc1q...',  // Where to send refunds
    sellerAddress: 'bc1q...', // Where to send payment
  }, null, 2));
  console.log('State saved to /tmp/escrow-state.json');
}

main().catch(console.error);
