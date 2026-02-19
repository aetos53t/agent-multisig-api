#!/usr/bin/env npx tsx
/**
 * DAO Treasury Example
 * 
 * Shows how 3 AI council members can manage a shared treasury.
 * Any 2 members must agree to release funds.
 * 
 * Use case: AI-governed protocol treasury
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

function generateMember(role: string) {
  const privateKey = randomBytes(32);
  const publicKey = schnorr.getPublicKey(privateKey);
  return {
    role,
    privateKey: hex.encode(privateKey),
    publicKey: hex.encode(publicKey),
  };
}

async function main() {
  console.log('🏛️  DAO TREASURY EXAMPLE\n');

  // Council members with different roles
  const council = [
    generateMember('TREASURY_LEAD'),    // Manages day-to-day
    generateMember('RISK_OFFICER'),      // Approves large txns
    generateMember('COMMUNITY_REP'),     // Community oversight
  ];

  console.log('Council Members:');
  council.forEach(m => {
    console.log(`  ${m.role}: ${m.publicKey.slice(0, 16)}...`);
  });
  console.log();

  // Register council members
  console.log('Registering council with API...');
  const registeredMembers = [];
  for (const m of council) {
    const res = await api('POST', '/agents', {
      name: m.role,
      publicKey: m.publicKey,
      provider: 'custom',
      metadata: {
        role: m.role,
        organization: 'ExampleDAO',
        permissions: m.role === 'TREASURY_LEAD' ? ['propose', 'sign'] : ['sign'],
      },
    });
    registeredMembers.push({ ...m, id: res.data.id });
    console.log(`  ✓ ${m.role} registered`);
  }
  console.log();

  // Create 2-of-3 treasury
  console.log('Creating 2-of-3 DAO treasury...');
  const treasuryRes = await api('POST', '/multisigs', {
    name: 'ExampleDAO Treasury',
    chainId: 'bitcoin-mainnet',
    threshold: 2,  // Any 2 council members can release funds
    agents: registeredMembers.map(m => ({
      id: m.id,
      name: m.role,
      publicKey: m.publicKey,
      provider: 'custom',
    })),
  });

  const treasury = treasuryRes.data;
  console.log(`  ✓ Treasury created`);
  console.log(`  ✓ Address: ${treasury.address}`);
  console.log();

  // Governance flow
  console.log('📋 Governance Flow:\n');
  console.log('  1. TREASURY_LEAD proposes payment');
  console.log('  2. RISK_OFFICER reviews and signs');
  console.log('  3. Threshold met (2/3) → Transaction broadcasts');
  console.log();
  console.log('  OR');
  console.log();
  console.log('  1. COMMUNITY_REP proposes emergency payment');
  console.log('  2. TREASURY_LEAD reviews and signs');
  console.log('  3. Threshold met (2/3) → Transaction broadcasts');
  console.log();

  console.log('💰 Fund the treasury to test:');
  console.log(`   ${treasury.address}`);
  console.log();

  // Save state for testing
  const fs = await import('fs');
  fs.writeFileSync('/tmp/dao-treasury-state.json', JSON.stringify({
    treasury,
    council: registeredMembers,
  }, null, 2));
  console.log('State saved to /tmp/dao-treasury-state.json');
}

main().catch(console.error);
