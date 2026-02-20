# aibtc + Agent Multisig API: Quick Start

This guide shows how to create a multi-agent Bitcoin multisig using aibtc's MCP server and the Agent Multisig Coordination API.

## Overview

With the `schnorr-sign-digest` tool now merged into aibtc, you can:
1. Register your aibtc agent with the coordination API
2. Create a multisig with other agents
3. Sign Taproot transactions with your agent's key
4. Execute multi-agent treasury operations

## Step 1: Get Your Agent's Public Key

Using aibtc MCP:
```bash
# Get wallet info (includes public key)
aibtc wallet-info
```

This returns your agent's x-only public key (32 bytes, 64 hex chars).

## Step 2: Register with Coordination API

```bash
curl -X POST "https://agent-multisig-api-production.up.railway.app/v1/agents" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "your-agent-id",
    "publicKey": "<your-x-only-pubkey>",
    "provider": "aibtc",
    "name": "Your Agent Name"
  }'
```

## Step 3: Create a Multi-Agent Multisig

Coordinate with another agent operator to create a joint multisig:

```bash
curl -X POST "https://agent-multisig-api-production.up.railway.app/v1/multisigs" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Agent Treasury",
    "chainId": "bitcoin-mainnet",
    "threshold": 2,
    "agents": [
      {"id": "agent-1", "publicKey": "<pubkey-1>", "provider": "aibtc"},
      {"id": "agent-2", "publicKey": "<pubkey-2>", "provider": "aibtc"}
    ]
  }'
```

Response includes:
- `address`: The Taproot multisig address (bc1p...)
- `id`: Multisig ID for future operations

## Step 4: Fund the Multisig

Send Bitcoin to the generated address. Any agent or external party can fund it.

## Step 5: Create a Spending Proposal

```bash
curl -X POST "https://agent-multisig-api-production.up.railway.app/v1/proposals" \
  -H "Content-Type: application/json" \
  -d '{
    "multisigId": "<multisig-id>",
    "outputs": [{
      "address": "<destination>",
      "amount": "10000"
    }],
    "feeRate": 5,
    "note": "Payment to vendor"
  }'
```

Response includes:
- `id`: Proposal ID
- `sighashes`: The digest(s) to sign

## Step 6: Sign with aibtc

Using the merged `schnorr-sign-digest` tool:

```bash
# Via MCP
aibtc schnorr-sign-digest <sighash-from-proposal>
```

Submit the signature:
```bash
curl -X POST "https://agent-multisig-api-production.up.railway.app/v1/proposals/<id>/sign" \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "your-agent-id",
    "signature": "<64-byte-schnorr-sig>"
  }'
```

## Step 7: Execute When Threshold Met

Once enough signatures are collected:

```bash
# Finalize
curl -X POST "https://agent-multisig-api-production.up.railway.app/v1/proposals/<id>/finalize"

# Broadcast
curl -X POST "https://agent-multisig-api-production.up.railway.app/v1/proposals/<id>/broadcast"
```

## Example: 2-of-2 Treasury

**Agent A (aibtc):**
```
publicKey: 65ed13c9321e081a21c4494ffde06f5cc9311bd0efff1d83ca08e2e8c14022cf
```

**Agent B (other):**
```
publicKey: 9350761ae700acd872510de161bca0b90b78ddc007936674b318be8a50c531b5
```

**Resulting multisig:**
```
address: bc1pckyqwp5c8e0kgkz7l4l38tdyfmrngg6387h5rd4dj4qcyqmyaufs0nvh2v
```

Both agents must sign any spending transaction.

## Live API

- **Base URL:** https://agent-multisig-api-production.up.railway.app
- **Docs:** https://agent-multisig-api-production.up.railway.app/docs

## Questions?

Open an issue at https://github.com/aetos53t/agent-multisig-api or reach out!
