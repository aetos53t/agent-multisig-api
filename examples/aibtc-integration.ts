/**
 * aibtc + Agent Multisig API Integration Example
 * 
 * This shows how aibtc agents can use our coordination API for
 * multi-agent Taproot multisigs.
 * 
 * Flow:
 * 1. Three aibtc agents each have a Taproot wallet (via schnorr_sign_digest)
 * 2. They register with the coordination API
 * 3. Create a 2-of-3 multisig
 * 4. One proposes a transaction
 * 5. Others review the PSBT and sign
 * 6. Coordinator finalizes and broadcasts
 */

import { schnorr } from '@noble/curves/secp256k1';
import { hex } from '@scure/base';

const API_URL = process.env.API_URL || 'https://agent-multisig-api-production.up.railway.app';

// ═══════════════════════════════════════════════════════════════════
//                     SIMULATE AIBTC AGENTS
// ═══════════════════════════════════════════════════════════════════

interface AibtcAgent {
  name: string;
  privateKey: Uint8Array;
  publicKey: Uint8Array; // x-only
}

function createAibtcAgent(name: string, seedHex: string): AibtcAgent {
  const privateKey = hex.decode(seedHex);
  const publicKey = schnorr.getPublicKey(privateKey);
  return { name, privateKey, publicKey };
}

// Simulate 3 aibtc agents (in real world, each runs on different machine)
const agents: AibtcAgent[] = [
  createAibtcAgent('treasury-alpha', '0000000000000000000000000000000000000000000000000000000000000001'),
  createAibtcAgent('treasury-beta', '0000000000000000000000000000000000000000000000000000000000000002'),
  createAibtcAgent('treasury-gamma', '0000000000000000000000000000000000000000000000000000000000000003'),
];

// ═══════════════════════════════════════════════════════════════════
//                     AIBTC schnorr_sign_digest
// ═══════════════════════════════════════════════════════════════════

/**
 * This is what the aibtc MCP tool does internally.
 * After our PR is merged, aibtc agents can call schnorr_sign_digest
 * to sign coordination messages.
 */
function aibtcSchnorrSignDigest(agent: AibtcAgent, digestHex: string): string {
  const digest = hex.decode(digestHex);
  const signature = schnorr.sign(digest, agent.privateKey);
  return hex.encode(signature);
}

// ═══════════════════════════════════════════════════════════════════
//                     COORDINATION API CALLS
// ═══════════════════════════════════════════════════════════════════

async function createMultisig(agents: AibtcAgent[], threshold: number): Promise<any> {
  // Convert agents to API format
  const agentInputs = agents.map(agent => ({
    id: agent.name,
    name: agent.name,
    publicKey: hex.encode(agent.publicKey),
    provider: 'aibtc' as const,
  }));
  
  const res = await fetch(`${API_URL}/v1/multisigs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'dao-treasury',
      chainId: 'bitcoin-mainnet',
      threshold,
      agents: agentInputs,
    }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error?.message || 'Multisig creation failed');
  return data.data;
}

async function createProposal(multisigId: string, outputs: any[]): Promise<any> {
  const res = await fetch(`${API_URL}/v1/proposals`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      multisigId,
      outputs,
      allowUnconfirmed: true, // For demo
    }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error?.message || 'Proposal creation failed');
  return data.data;
}

async function submitSignature(proposalId: string, agentId: string, signature: string): Promise<any> {
  const res = await fetch(`${API_URL}/v1/proposals/${proposalId}/sign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agentId, signature }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error?.message || 'Signing failed');
  return data.data;
}

async function finalizeProposal(proposalId: string): Promise<any> {
  const res = await fetch(`${API_URL}/v1/proposals/${proposalId}/finalize`, {
    method: 'POST',
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error?.message || 'Finalization failed');
  return data.data;
}

async function broadcastProposal(proposalId: string): Promise<any> {
  const res = await fetch(`${API_URL}/v1/proposals/${proposalId}/broadcast`, {
    method: 'POST',
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error?.message || 'Broadcast failed');
  return data.data;
}

// ═══════════════════════════════════════════════════════════════════
//                     FULL INTEGRATION FLOW
// ═══════════════════════════════════════════════════════════════════

async function main() {
  console.log('🔧 aibtc + Agent Multisig API Integration Demo\n');
  
  // Step 1: Create 2-of-3 multisig with agents
  console.log('1️⃣ Creating 2-of-3 Taproot multisig with aibtc agents...');
  for (const agent of agents) {
    console.log(`   • ${agent.name}: ${hex.encode(agent.publicKey).slice(0, 16)}...`);
  }
  
  const multisig = await createMultisig(agents, 2);
  console.log(`   ✓ Address: ${multisig.address}`);
  console.log(`   ✓ Multisig ID: ${multisig.id}`);
  
  // Step 2: Fund the multisig (manual step - user sends BTC to address)
  console.log(`\n💰 Fund this address to continue: ${multisig.address}`);
  console.log('   (Send at least 10,000 sats for testing)\n');
  
  // In a real scenario, we'd wait for UTXOs...
  // For this demo, we'll try to create a proposal anyway to show the flow
  
  // Step 3: Create a proposal (will fail if no UTXOs)
  console.log('2️⃣ Creating spend proposal...');
  try {
    const proposal = await createProposal(multisig.id, [
      { address: 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4', amount: 5000 }, // Valid address
    ]);
    
    console.log(`   ✓ Proposal ID: ${proposal.id}`);
    console.log(`   ✓ Sighash: ${proposal.sighashes[0].sighash}`);
    
    // Step 4: Each required agent signs
    console.log('\n3️⃣ Collecting signatures (need 2 of 3)...');
    
    // Agent Alpha signs using aibtc's schnorr_sign_digest
    const sighash = proposal.sighashes[0].sighash;
    const sig1 = aibtcSchnorrSignDigest(agents[0], sighash);
    const result1 = await submitSignature(proposal.id, agents[0].name, sig1);
    console.log(`   ✓ ${agents[0].name} signed (${result1.signatureCount}/${result1.threshold})`);
    
    // Agent Beta signs
    const sig2 = aibtcSchnorrSignDigest(agents[1], sighash);
    const result2 = await submitSignature(proposal.id, agents[1].name, sig2);
    console.log(`   ✓ ${agents[1].name} signed (${result2.signatureCount}/${result2.threshold})`);
    
    if (result2.thresholdMet) {
      console.log('   🎉 Threshold met!');
      
      // Step 5: Finalize
      console.log('\n4️⃣ Finalizing transaction...');
      const finalized = await finalizeProposal(proposal.id);
      console.log(`   ✓ TXID: ${finalized.txid}`);
      
      // Step 6: Broadcast
      console.log('\n5️⃣ Broadcasting to network...');
      const broadcast = await broadcastProposal(proposal.id);
      console.log(`   ✓ Broadcast successful!`);
      console.log(`   🔗 ${broadcast.explorerUrl}`);
    }
    
  } catch (error: any) {
    if (error.message.includes('No UTXOs') || error.message.includes('No confirmed UTXOs')) {
      console.log('   ⏳ No UTXOs yet - fund the address first');
      console.log('\n📝 Demo Flow Summary:');
      console.log('   1. aibtc agents register pubkeys with coordination API');
      console.log('   2. API creates Taproot multisig address');
      console.log('   3. When funded, any agent proposes a spend');
      console.log('   4. API returns sighash for each input');
      console.log('   5. Agents sign using schnorr_sign_digest (our PR)');
      console.log('   6. API collects sigs, finalizes PSBT, broadcasts');
      console.log('\n   This is why the aibtc PR matters! ☝️');
    } else {
      throw error;
    }
  }
}

main().catch(console.error);
