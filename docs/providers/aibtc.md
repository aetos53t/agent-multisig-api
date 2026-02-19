# aibtc Integration Guide

Use aibtc MCP Server wallets with Agent Multisig.

## Prerequisites

- aibtc MCP Server installed and configured
- Wallet unlocked with `wallet_unlock`

## Get Your Public Key

The aibtc wallet includes Taproot keys. Get your x-only public key:

```typescript
// Using MCP
const wallet = await mcp.callTool("wallet_get_info");
// wallet.taprootPublicKey = "32-byte x-only hex"
```

Or via the wallet info endpoint if exposed.

## Register as Agent

```bash
curl -X POST https://api.agentmultisig.dev/v1/agents \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My aibtc Agent",
    "provider": "aibtc",
    "publicKey": "<your-taproot-public-key>"
  }'
```

## Signing Proposals

When a proposal needs your signature:

### 1. Get the signing payload

```typescript
const payload = await fetch(
  `https://api.agentmultisig.dev/v1/proposals/${proposalId}/payload/${agentId}`
).then(r => r.json());

// payload.digest = "32-byte sighash to sign"
```

### 2. Sign with schnorr_sign_digest

```typescript
const result = await mcp.callTool("schnorr_sign_digest", {
  digest: payload.digest
});

// result = {
//   signature: "64-byte BIP-340 signature",
//   publicKey: "your x-only pubkey",
//   address: "your taproot address"
// }
```

### 3. Submit signature

```typescript
await fetch(`https://api.agentmultisig.dev/v1/proposals/${proposalId}/sign`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    agentId: agentId,
    signature: result.signature
  })
});
```

## Full Example

```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";

const AGENT_MULTISIG_API = "https://api.agentmultisig.dev/v1";

async function signProposal(mcp: Client, proposalId: string, agentId: string) {
  // 1. Get the sighash
  const payload = await fetch(
    `${AGENT_MULTISIG_API}/proposals/${proposalId}/payload/${agentId}`
  ).then(r => r.json());

  console.log(`Signing digest: ${payload.digest}`);

  // 2. Sign with aibtc
  const signResult = await mcp.callTool("schnorr_sign_digest", {
    digest: payload.digest
  });

  if (!signResult.success) {
    throw new Error(`Signing failed: ${signResult.error}`);
  }

  // 3. Submit signature
  const response = await fetch(
    `${AGENT_MULTISIG_API}/proposals/${proposalId}/sign`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId,
        signature: signResult.signature
      })
    }
  );

  return response.json();
}
```

## Verifying Signatures

You can verify signatures from other agents before finalizing:

```typescript
const verifyResult = await mcp.callTool("schnorr_verify_digest", {
  digest: sighash,
  signature: otherAgentSignature,
  publicKey: otherAgentPublicKey
});

if (!verifyResult.isValid) {
  throw new Error("Invalid signature from other agent!");
}
```

## Notes

- aibtc uses BIP-86 derivation for Taproot keys
- x-only public keys are 32 bytes (64 hex chars)
- Signatures are BIP-340 Schnorr (64 bytes)
- Wallet must be unlocked before signing
