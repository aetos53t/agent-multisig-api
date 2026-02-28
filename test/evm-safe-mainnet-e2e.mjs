/**
 * EVM Safe Mainnet E2E Test
 * 
 * Tests the complete flow:
 * 1. Register 3 agents with EVM addresses
 * 2. Create 2-of-3 Safe on Ethereum mainnet
 * 3. Verify Safe deployment
 */

import { createWalletClient, createPublicClient, http, parseEther, formatEther } from 'viem';
import { mainnet } from 'viem/chains';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { randomBytes } from 'crypto';
import * as secp from '@noble/secp256k1';
import { keccak256, toHex } from 'viem';

const API_URL = process.env.API_URL || 'https://quorumclaw.com';

// Our funded account
const FUNDER_KEY = '0x' + randomBytes(32).toString('hex'); // Will generate new one

async function api(method, path, body) {
  const prefix = path === '/health' ? '' : '/v1';
  const url = `${API_URL}${prefix}${path}`;
  console.log(`   → ${method} ${path}`);
  
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

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║       EVM SAFE MAINNET E2E TEST                                ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log();
  console.log(`API: ${API_URL}`);
  console.log();

  // Health check
  console.log('1. Health check...');
  const health = await api('GET', '/health');
  console.log('   ✓ API healthy:', health.status);
  console.log();

  // Generate 3 EVM keypairs
  console.log('2. Generating EVM keypairs...');
  const agents = [];
  for (let i = 0; i < 3; i++) {
    const privateKey = generatePrivateKey();
    const account = privateKeyToAccount(privateKey);
    // Get compressed public key (33 bytes) and convert to hex without 0x
    const privKeyBytes = Buffer.from(privateKey.slice(2), 'hex');
    const pubKeyCompressed = secp.getPublicKey(privKeyBytes, true);
    const pubKeyHex = Buffer.from(pubKeyCompressed).toString('hex');
    agents.push({
      name: ['ALPHA', 'BETA', 'GAMMA'][i],
      privateKey,
      address: account.address,
      publicKey: pubKeyHex, // 66 chars (33 bytes compressed)
    });
    console.log(`   ${agents[i].name}: ${account.address}`);
    console.log(`      pubkey: ${pubKeyHex.slice(0, 20)}...`);
  }
  console.log();

  // Register agents - for EVM, we use address as "publicKey"
  // The API validator wants 64+ chars, so we'll register with pubkey but use address for Safe
  console.log('3. Registering agents...');
  const registeredAgents = [];
  for (const a of agents) {
    const res = await api('POST', '/agents', {
      name: `EVM_${a.name}`,
      publicKey: a.publicKey, // Register with actual pubkey (for validation)
      provider: 'custom',
    });
    registeredAgents.push({ ...a, id: res.data.id });
    console.log(`   ✓ ${a.name} registered: ${res.data.id}`);
  }
  console.log();

  // Create 2-of-3 Safe multisig
  console.log('4. Creating 2-of-3 Safe on Ethereum mainnet...');
  try {
    const multisigRes = await api('POST', '/multisigs', {
      name: 'EVM E2E Test Safe',
      chainId: 'ethereum',
      threshold: 2,
      agents: registeredAgents.map(a => ({
        id: a.id,
        name: a.name,
        publicKey: a.publicKey, // Use full public key, not address
        provider: 'custom',
      })),
    });
    
    const multisig = multisigRes.data;
    console.log('   ✓ Created multisig:', multisig.id);
    console.log('   ✓ Safe Address:', multisig.address);
    console.log();

    // Check if Safe exists on-chain
    console.log('5. Verifying Safe on-chain...');
    const publicClient = createPublicClient({
      chain: mainnet,
      transport: http('https://eth.llamarpc.com'),
    });

    const code = await publicClient.getCode({ address: multisig.address });
    if (code && code !== '0x') {
      console.log('   ✓ Safe deployed! Code length:', code.length);
    } else {
      console.log('   ⏳ Safe not yet deployed (will deploy on first tx)');
      console.log('   ℹ️  This is expected - Safe uses counterfactual deployment');
    }
    console.log();

    // Save results
    const results = {
      multisig,
      agents: registeredAgents.map(a => ({
        id: a.id,
        name: a.name,
        address: a.address,
        privateKey: a.privateKey,
      })),
    };

    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║                    TEST COMPLETE ✓                             ║');
    console.log('╚════════════════════════════════════════════════════════════════╝');
    console.log();
    console.log('Safe Address:', multisig.address);
    console.log();
    console.log('Next steps:');
    console.log('1. Fund the Safe address to deploy it');
    console.log('2. Create a proposal via API');
    console.log('3. Sign with 2 agents');
    console.log('4. Execute transaction');
    console.log();
    
    // Output keys for reference
    console.log('Agent keys (save these):');
    console.log(JSON.stringify(results, null, 2));
    
  } catch (err) {
    console.error('Failed:', err.message);
    throw err;
  }
}

main().catch(console.error);
