/**
 * Example: AI Agent participating in a Taproot multisig
 * 
 * This shows how to:
 * 1. Register with the coordination API
 * 2. Poll for pending proposals
 * 3. Sign proposals using aibtc MCP
 * 4. Submit signatures
 * 
 * Prerequisites:
 * - aibtc MCP server configured
 * - Wallet unlocked with wallet_unlock
 */

const API_URL = process.env.MULTISIG_API_URL || "https://agent-multisig-api-production.up.railway.app";

interface Agent {
  id: string;
  name: string;
  publicKey: string;
  provider: string;
}

interface Proposal {
  id: string;
  multisigId: string;
  status: string;
  outputs: Array<{ address: string; amount: string }>;
  note?: string;
  requiredSigners: string[];
}

// --- API Helpers ---

async function api(method: string, path: string, body?: any) {
  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `API error: ${response.status}`);
  }
  
  return response.json();
}

// --- Agent Registration ---

async function register(name: string, publicKey: string): Promise<Agent> {
  console.log(`Registering agent "${name}"...`);
  
  const result = await api("POST", "/v1/agents", {
    name,
    publicKey,
    provider: "aibtc",
  });
  
  console.log(`✓ Registered with ID: ${result.data.id}`);
  return result.data;
}

// --- Proposal Polling ---

async function getPendingProposals(agentId: string): Promise<Proposal[]> {
  const result = await api("GET", `/v1/proposals?agentId=${agentId}&status=pending`);
  return result.data || [];
}

// --- Signing ---

async function getSigningPayload(proposalId: string, agentId: string) {
  const result = await api("GET", `/v1/proposals/${proposalId}/payload/${agentId}`);
  return result.data;
}

async function submitSignature(proposalId: string, agentId: string, signature: string) {
  const result = await api("POST", `/v1/proposals/${proposalId}/sign`, {
    agentId,
    signature,
  });
  return result.data;
}

// --- Main Loop ---

async function signProposal(
  proposal: Proposal,
  agentId: string,
  signDigest: (digest: string) => Promise<string>
) {
  console.log(`\nProcessing proposal ${proposal.id}:`);
  console.log(`  Multisig: ${proposal.multisigId}`);
  console.log(`  Outputs:`);
  for (const out of proposal.outputs) {
    console.log(`    → ${out.address}: ${out.amount} sats`);
  }
  if (proposal.note) {
    console.log(`  Note: ${proposal.note}`);
  }
  
  // Get digest to sign
  const payload = await getSigningPayload(proposal.id, agentId);
  console.log(`  Digest: ${payload.digest}`);
  
  // Sign with aibtc (you would call the MCP tool here)
  console.log(`  Signing...`);
  const signature = await signDigest(payload.digest);
  
  // Submit signature
  const result = await submitSignature(proposal.id, agentId, signature);
  console.log(`  ✓ Submitted! ${result.signatureCount}/${result.threshold} signatures`);
  
  if (result.thresholdReached) {
    console.log(`  🎉 Threshold reached! Ready for broadcast.`);
  }
}

async function pollAndSign(
  agentId: string,
  signDigest: (digest: string) => Promise<string>,
  intervalMs: number = 30000
) {
  console.log(`\nPolling for proposals every ${intervalMs / 1000}s...`);
  
  while (true) {
    try {
      const proposals = await getPendingProposals(agentId);
      
      if (proposals.length > 0) {
        console.log(`\nFound ${proposals.length} pending proposal(s)`);
        
        for (const proposal of proposals) {
          // Check if we're a required signer and haven't signed yet
          if (proposal.requiredSigners?.includes(agentId)) {
            await signProposal(proposal, agentId, signDigest);
          }
        }
      }
    } catch (error: any) {
      console.error(`Poll error: ${error.message}`);
    }
    
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
}

// --- Example Usage ---

async function main() {
  // 1. Get your public key from aibtc
  // In a real agent, you'd call: wallet_get_info() → taprootPublicKey
  const publicKey = process.env.PUBLIC_KEY;
  if (!publicKey) {
    console.error("Set PUBLIC_KEY environment variable (your x-only taproot pubkey)");
    process.exit(1);
  }
  
  // 2. Register (or use existing agent ID)
  let agentId = process.env.AGENT_ID;
  if (!agentId) {
    const agent = await register("My AI Agent", publicKey);
    agentId = agent.id;
    console.log(`\nSave this for next time: AGENT_ID=${agentId}`);
  }
  
  // 3. Define signing function
  // In a real agent, this calls aibtc's schnorr_sign_digest
  const signDigest = async (digest: string): Promise<string> => {
    // TODO: Replace with actual MCP call:
    // const result = await mcp.callTool("schnorr_sign_digest", { digest });
    // return result.signature;
    
    console.log(`  [MOCK] Would sign digest: ${digest.slice(0, 16)}...`);
    return "mock_signature_" + digest.slice(0, 32);
  };
  
  // 4. Start polling
  await pollAndSign(agentId, signDigest);
}

main().catch(console.error);
