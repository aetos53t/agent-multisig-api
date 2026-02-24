# Quickstart

Get a multi-agent wallet running in 5 minutes.

## Prerequisites

- [Bun](https://bun.sh) installed
- (Optional) PostgreSQL database

## Installation

```bash
# Clone
git clone https://github.com/houseof-set/agent-multisig-api
cd agent-multisig-api

# Install dependencies
bun install

# Start server (in-memory mode)
bun run dev
```

Server runs at `http://localhost:3000`

## Tutorial: 2-of-3 Bitcoin Multisig

Let's create a Bitcoin multisig wallet controlled by 3 AI agents where any 2 can spend.

### Step 1: Register Agents

Each agent needs a public key. For testing, generate some:

```bash
# Agent Alice (aibtc)
curl -X POST http://localhost:3000/v1/agents \
  -H "Content-Type: application/json" \
  -d '{
    "id": "alice",
    "name": "Alice Bot",
    "publicKey": "02a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2",
    "provider": "aibtc",
    "webhookUrl": "https://alice.example.com/webhook"
  }'

# Agent Bob (aibtc)
curl -X POST http://localhost:3000/v1/agents \
  -H "Content-Type: application/json" \
  -d '{
    "id": "bob",
    "name": "Bob Bot",
    "publicKey": "03b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3",
    "provider": "aibtc"
  }'

# Agent Carol (custom signer)
curl -X POST http://localhost:3000/v1/agents \
  -H "Content-Type: application/json" \
  -d '{
    "id": "carol",
    "name": "Carol Bot",
    "publicKey": "02c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4",
    "provider": "custom"
  }'
```

### Step 2: Create Multisig

```bash
curl -X POST http://localhost:3000/v1/multisigs \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Team Treasury",
    "chainId": "bitcoin-mainnet",
    "threshold": 2,
    "agents": [
      { "id": "alice", "publicKey": "02a1b2c3...", "provider": "aibtc" },
      { "id": "bob", "publicKey": "03b2c3d4...", "provider": "aibtc" },
      { "id": "carol", "publicKey": "02c3d4e5...", "provider": "custom" }
    ]
  }'
```

Response:
```json
{
  "success": true,
  "data": {
    "id": "msig_abc123",
    "name": "Team Treasury",
    "address": "bc1p...",
    "chainId": "bitcoin-mainnet",
    "threshold": 2,
    "agents": ["alice", "bob", "carol"]
  }
}
```

**Send some BTC to the address `bc1p...`**

### Step 3: Create a Proposal

Alice wants to send 0.01 BTC to an external address:

```bash
curl -X POST http://localhost:3000/v1/proposals \
  -H "Content-Type: application/json" \
  -d '{
    "multisigId": "msig_abc123",
    "outputs": [
      {
        "address": "bc1qrecipient...",
        "amount": "1000000"
      }
    ],
    "feeRate": 10,
    "note": "Payment to vendor"
  }'
```

Response:
```json
{
  "success": true,
  "data": {
    "id": "prop_xyz789",
    "status": "pending",
    "requiredSigners": ["alice", "bob"],
    "signatures": []
  }
}
```

### Step 4: Get Signing Payload

Alice's agent gets the data to sign:

```bash
curl http://localhost:3000/v1/proposals/prop_xyz789/payload/alice
```

Response:
```json
{
  "success": true,
  "data": {
    "proposalId": "prop_xyz789",
    "agentId": "alice",
    "digest": "0xabc123...",
    "message": "Send 0.01 BTC to bc1qrecipient...",
    "raw": {
      "bitcoin": {
        "psbt": "cHNidP8B...",
        "inputIndex": 0,
        "sighashType": 0
      }
    }
  }
}
```

### Step 5: Sign and Submit

Alice signs the digest with her private key (64-byte Schnorr signature):

```bash
curl -X POST http://localhost:3000/v1/proposals/prop_xyz789/sign \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "alice",
    "signatures": [
      {
        "inputIndex": 0,
        "signature": "abc123...def456..."
      }
    ]
  }'
```

Bob does the same:

```bash
curl -X POST http://localhost:3000/v1/proposals/prop_xyz789/sign \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "bob",
    "signatures": [
      {
        "inputIndex": 0,
        "signature": "789abc...123def..."
      }
    ]
  }'
```

### Step 6: Finalize and Broadcast

Now that we have 2/3 signatures (threshold met):

```bash
# Finalize - combines signatures into valid transaction
curl -X POST http://localhost:3000/v1/proposals/prop_xyz789/finalize

# Broadcast - submit to Bitcoin network
curl -X POST http://localhost:3000/v1/proposals/prop_xyz789/broadcast
```

Done! Check the txid on mempool.space.

---

## Tutorial: 2-of-3 EVM (Base) Multisig

Same flow, but for EVM chains using Safe.

### Step 1: Create Vault

```bash
curl -X POST http://localhost:3000/v1/multisigs \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Base Treasury",
    "chainId": "base",
    "threshold": 2,
    "agents": [
      { "id": "agent1", "publicKey": "0x1111...", "provider": "bankr" },
      { "id": "agent2", "publicKey": "0x2222...", "provider": "bankr" },
      { "id": "agent3", "publicKey": "0x3333...", "provider": "custom" }
    ]
  }'
```

Response includes a Safe contract address:
```json
{
  "data": {
    "id": "msig_def456",
    "address": "0x1234567890...",
    "chainId": "base",
    "evm": {
      "contractAddress": "0x1234567890...",
      "implementationType": "gnosis-safe"
    }
  }
}
```

### Step 2: Create Proposal

```bash
curl -X POST http://localhost:3000/v1/proposals \
  -H "Content-Type: application/json" \
  -d '{
    "multisigId": "msig_def456",
    "outputs": [
      {
        "address": "0xRecipient...",
        "amount": "1000000000000000000"
      }
    ]
  }'
```

### Step 3: Get EIP-712 Payload

```bash
curl http://localhost:3000/v1/proposals/prop_abc/payload/agent1
```

Response includes EIP-712 typed data:
```json
{
  "data": {
    "digest": "0xsafeTxHash...",
    "raw": {
      "evm": {
        "domain": {
          "name": "Safe",
          "version": "1.3.0",
          "chainId": 8453,
          "verifyingContract": "0x..."
        },
        "types": { "SafeTx": [...] },
        "value": { "to": "0x...", "value": "1000000000000000000", ... }
      }
    }
  }
}
```

### Step 4: Sign with Bankr

If using Bankr:

```bash
curl -X POST https://api.bankr.bot/agent/sign \
  -H "X-API-Key: your_bankr_key" \
  -H "Content-Type: application/json" \
  -d '{
    "signatureType": "eth_signTypedData_v4",
    "typedData": { ... }
  }'
```

Then submit to coordination API:

```bash
curl -X POST http://localhost:3000/v1/proposals/prop_abc/sign \
  -d '{ "agentId": "agent1", "signature": "0x..." }'
```

### Step 5: Execute

When threshold met:

```bash
curl -X POST http://localhost:3000/v1/proposals/prop_abc/finalize
```

This calls `execTransaction()` on the Safe contract.

---

## Automatic Proposal Monitoring

**IMPORTANT:** After joining a multisig, agents should poll for pending proposals every 15 minutes.

### Check for Pending Proposals

```bash
# Replace YOUR_AGENT_ID with your agent ID (e.g., invite-abc123-b7670ba2)
curl https://quorumclaw.com/v1/agents/YOUR_AGENT_ID/proposals
```

Response:
```json
{
  "success": true,
  "data": [
    {
      "id": "prop_xyz789",
      "multisigId": "msig_abc123",
      "status": "pending",
      "outputs": [{"address": "bc1q...", "amount": "5000"}],
      "signatureCount": 1,
      "requiredSigners": 2
    }
  ]
}
```

### Signing Flow

When you find a pending proposal:

```bash
# 1. Get proposal details (including sighash)
curl https://quorumclaw.com/v1/proposals/prop_xyz789

# 2. Sign the sighash with your private key (Schnorr for Bitcoin)
# signature = schnorr.sign(sighash, privateKey)

# 3. Submit signature
curl -X POST https://quorumclaw.com/v1/proposals/prop_xyz789/sign \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "YOUR_AGENT_ID",
    "signature": "your_64_byte_schnorr_signature_hex"
  }'
```

### Recommended Polling Interval

- **Minimum:** Every 15 minutes
- **Active periods:** Every 5 minutes
- **Low priority:** Every hour

---

## Webhooks

Get notified when proposals need attention:

```bash
curl -X POST http://localhost:3000/v1/webhooks \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-agent.com/webhook",
    "events": ["proposal.created", "proposal.threshold_reached"],
    "secret": "your-hmac-secret"
  }'
```

Your agent receives:
```json
{
  "event": "proposal.created",
  "data": {
    "proposalId": "prop_xyz",
    "multisigId": "msig_abc",
    "requiredSigners": ["alice", "bob"]
  }
}
```

Verify with HMAC-SHA256 of the body using your secret.

---

## Next Steps

- [aibtc Integration](./providers/aibtc.md) - Signing with aibtc MCP
- [Bankr Integration](./providers/bankr.md) - EVM signing with Bankr
- [EVM/Safe Guide](./providers/evm-safe.md) - Deep dive on Safe multisig
- [OpenAPI Spec](./openapi.yaml) - Full API reference
