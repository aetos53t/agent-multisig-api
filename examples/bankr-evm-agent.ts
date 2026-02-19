/**
 * Example: AI Agent participating in an EVM Safe multisig via Bankr
 * 
 * This shows how to:
 * 1. Register with the coordination API
 * 2. Poll for pending proposals
 * 3. Sign Safe transactions using Bankr API
 * 4. Submit signatures
 * 
 * Prerequisites:
 * - Bankr agent wallet set up
 * - Bankr API key
 */

const API_URL = process.env.MULTISIG_API_URL || "https://agent-multisig-api-production.up.railway.app";
const BANKR_API_URL = "https://api.bankr.bot";
const BANKR_API_KEY = process.env.BANKR_API_KEY;

if (!BANKR_API_KEY) {
  console.error("Set BANKR_API_KEY environment variable");
  process.exit(1);
}

interface Proposal {
  id: string;
  multisigId: string;
  status: string;
  outputs: Array<{ address: string; amount: string }>;
  note?: string;
}

// --- API Helpers ---

async function multisigApi(method: string, path: string, body?: any) {
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

async function bankrApi(method: string, path: string, body?: any) {
  const response = await fetch(`${BANKR_API_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": BANKR_API_KEY!,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(`Bankr error: ${error.message || response.status}`);
  }
  
  return response.json();
}

// --- Bankr Wallet ---

async function getBankrWalletAddress(): Promise<string> {
  const result = await bankrApi("GET", "/agent/wallet");
  return result.address;
}

async function signTypedData(typedData: any): Promise<string> {
  const result = await bankrApi("POST", "/agent/sign", {
    signatureType: "eth_signTypedData_v4",
    typedData,
  });
  return result.signature;
}

// --- Registration ---

async function register(name: string): Promise<string> {
  console.log("Getting Bankr wallet address...");
  const address = await getBankrWalletAddress();
  console.log(`  Address: ${address}`);
  
  console.log(`Registering agent "${name}"...`);
  const result = await multisigApi("POST", "/v1/agents", {
    name,
    publicKey: address,
    provider: "bankr",
  });
  
  const agentId = result.data?.id || result.id;
  console.log(`✓ Registered with ID: ${agentId}`);
  return agentId;
}

// --- Signing ---

async function signProposal(proposal: Proposal, agentId: string) {
  console.log(`\nProcessing proposal ${proposal.id}:`);
  console.log(`  Status: ${proposal.status}`);
  
  for (const out of proposal.outputs) {
    console.log(`  → ${out.address}: ${out.amount}`);
  }
  
  // Get signing payload
  const payloadRes = await multisigApi(
    "GET",
    `/v1/proposals/${proposal.id}/payload/${agentId}`
  );
  const payload = payloadRes.data || payloadRes;
  
  console.log(`  Digest: ${payload.digest}`);
  
  // Check if we have EIP-712 typed data
  if (payload.raw?.evm) {
    console.log("  Signing with Bankr (EIP-712)...");
    
    const typedData = {
      domain: payload.raw.evm.domain,
      types: payload.raw.evm.types,
      primaryType: "SafeTx",
      message: payload.raw.evm.value,
    };
    
    const signature = await signTypedData(typedData);
    console.log(`  Signature: ${signature.slice(0, 20)}...`);
    
    // Submit signature
    const result = await multisigApi("POST", `/v1/proposals/${proposal.id}/sign`, {
      agentId,
      signature,
    });
    
    const data = result.data || result;
    console.log(`  ✓ Submitted! ${data.signatureCount}/${data.threshold} signatures`);
    
    if (data.signatureCount >= data.threshold) {
      console.log(`  🎉 Threshold reached! Ready for execution.`);
    }
  } else {
    // Fallback to digest signing
    console.log("  Signing digest with Bankr...");
    
    const signResult = await bankrApi("POST", "/agent/sign", {
      signatureType: "eth_sign",
      message: payload.digest,
    });
    
    const signature = signResult.signature;
    console.log(`  Signature: ${signature.slice(0, 20)}...`);
    
    // Submit signature
    const result = await multisigApi("POST", `/v1/proposals/${proposal.id}/sign`, {
      agentId,
      signature,
    });
    
    const data = result.data || result;
    console.log(`  ✓ Submitted! ${data.signatureCount}/${data.threshold} signatures`);
  }
}

// --- Polling ---

async function pollAndSign(agentId: string, intervalMs: number = 30000) {
  console.log(`\nPolling for EVM proposals every ${intervalMs / 1000}s...`);
  
  while (true) {
    try {
      const result = await multisigApi(
        "GET",
        `/v1/proposals?agentId=${agentId}&status=pending`
      );
      
      const proposals = result.data || [];
      
      if (proposals.length > 0) {
        console.log(`\nFound ${proposals.length} pending proposal(s)`);
        
        for (const proposal of proposals) {
          await signProposal(proposal, agentId);
        }
      }
    } catch (error: any) {
      console.error(`Poll error: ${error.message}`);
    }
    
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
}

// --- Main ---

async function main() {
  let agentId = process.env.AGENT_ID;
  
  if (!agentId) {
    agentId = await register("Bankr EVM Agent");
    console.log(`\nSave for next time: AGENT_ID=${agentId}`);
  } else {
    console.log(`Using existing agent: ${agentId}`);
  }
  
  await pollAndSign(agentId);
}

main().catch(console.error);
