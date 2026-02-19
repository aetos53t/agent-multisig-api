# Integration Guide

Quick integration guides for each supported wallet provider.

## Table of Contents
1. [aibtc (MCP Server)](#aibtc-mcp-server)
2. [Claw Cash](#claw-cash)
3. [Bankr (EVM)](#bankr-evm)
4. [Custom Wallet](#custom-wallet)

---

## aibtc (MCP Server)

The [aibtc MCP server](https://github.com/aibtcdev/aibtc-mcp-server) provides Bitcoin wallet functionality for Claude agents.

### Setup

```bash
# Install aibtc MCP server
npm install -g @aibtc/mcp-server

# Add to Claude config
{
  "mcpServers": {
    "aibtc": {
      "command": "aibtc-mcp-server"
    }
  }
}
```

### Integration

1. Create a wallet with aibtc:
```
Use aibtc to create a new wallet
```

2. Get your public key:
```
What's my Bitcoin public key?
```

3. Register with Agent Multisig:
```typescript
const agent = await client.registerAgent({
  name: 'MyAIBTCAgent',
  provider: 'aibtc',
  publicKey: 'YOUR_X_ONLY_PUBKEY',
});
```

4. When signing is needed, get the digest:
```typescript
const payload = await client.getSigningPayload(proposalId, agentId);
// payload.raw.bitcoin.sighash contains the digest
```

5. Sign with aibtc:
```
Sign this digest with my Bitcoin wallet: <digest>
```

6. Submit signature:
```typescript
await client.signProposal({
  proposalId,
  agentId,
  signature: 'SCHNORR_SIGNATURE_HEX',
});
```

---

## Claw Cash

[Claw Cash](https://github.com/tiero/claw-cash) is a Lightning/Bitcoin wallet for AI agents.

### Setup

```bash
# Install Claw Cash CLI
npm install -g claw-cash

# Create identity
claw-cash identity create
```

### Integration

1. Get your public key:
```bash
claw-cash identity show
# Outputs: publicKey: 02abc...
```

2. Register with Agent Multisig:
```typescript
const agent = await client.registerAgent({
  name: 'MyClawCashAgent',
  provider: 'clawcash',
  publicKey: 'YOUR_COMPRESSED_PUBKEY',
});
```

3. Sign digests:
```bash
claw-cash sign-digest <digest_hex>
```

4. Submit signature to API.

---

## Bankr (EVM)

[Bankr](https://bankr.dev) provides AI-native wallets for EVM chains with built-in EIP-712 signing.

### Setup

```typescript
import { Bankr } from '@bankr/sdk';

const bankr = new Bankr({
  apiKey: process.env.BANKR_API_KEY,
});
```

### Integration

1. Create or get wallet:
```typescript
const wallet = await bankr.wallets.create({ chain: 'base' });
// wallet.address: 0x...
```

2. Register with Agent Multisig:
```typescript
const agent = await client.registerAgent({
  name: 'MyBankrAgent',
  provider: 'bankr',
  publicKey: wallet.address,
  chain: 'evm',
});
```

3. Create Safe multisig:
```typescript
const multisig = await client.createMultisig({
  name: 'EVM Treasury',
  threshold: 2,
  agents: [agent1.id, agent2.id, agent3.id],
  chain: 'evm',
  network: 'base-mainnet',
});
```

4. Sign Safe transactions:
```typescript
// Get EIP-712 payload
const payload = await client.getSigningPayload(proposalId, agentId);

// Sign with Bankr
const signature = await bankr.wallets.signTypedData(
  wallet.id,
  payload.raw.evm.typedData
);

// Submit
await client.signProposal({ proposalId, agentId, signature });
```

---

## Custom Wallet

For custom implementations or other wallet providers.

### Requirements

1. **Schnorr signatures** for Bitcoin (BIP-340)
2. **x-only public keys** (32 bytes) for Taproot
3. **ECDSA/EIP-712** for EVM

### Bitcoin Example

```typescript
import { schnorr } from '@noble/curves/secp256k1';
import { hex } from '@scure/base';
import { randomBytes } from 'crypto';

// Generate keypair
const privateKey = randomBytes(32);
const publicKey = schnorr.getPublicKey(privateKey);

// Register
const agent = await client.registerAgent({
  name: 'CustomBot',
  provider: 'custom',
  publicKey: hex.encode(publicKey),
  chain: 'bitcoin',
});

// When signing needed
const payload = await client.getSigningPayload(proposalId, agent.id);
const sighash = hex.decode(payload.raw.bitcoin.sighash);
const signature = schnorr.sign(sighash, privateKey);

// Submit
await client.signProposal({
  proposalId,
  agentId: agent.id,
  signature: hex.encode(signature),
});
```

### EVM Example

```typescript
import { ethers } from 'ethers';

// Create wallet
const wallet = ethers.Wallet.createRandom();

// Register
const agent = await client.registerAgent({
  name: 'CustomEVMBot',
  provider: 'custom',
  publicKey: wallet.address,
  chain: 'evm',
});

// Sign Safe transaction
const payload = await client.getSigningPayload(proposalId, agent.id);
const signature = await wallet.signTypedData(
  payload.raw.evm.domain,
  payload.raw.evm.types,
  payload.raw.evm.message
);

// Submit
await client.signProposal({
  proposalId,
  agentId: agent.id,
  signature,
});
```

---

## Webhooks

Configure webhooks to receive events when proposals need signing:

```typescript
const agent = await client.registerAgent({
  name: 'MyAgent',
  provider: 'custom',
  publicKey: '...',
  webhookUrl: 'https://myserver.com/webhooks/multisig',
});
```

You'll receive:
- `proposal.created` - New proposal needs signatures
- `proposal.signed` - Another agent signed
- `proposal.ready` - Threshold met, can finalize
- `proposal.broadcast` - Transaction sent to network

Example webhook payload:
```json
{
  "event": "proposal.created",
  "proposalId": "abc123",
  "multisigId": "xyz789",
  "outputs": [
    { "address": "bc1q...", "amount": "10000" }
  ],
  "signers": ["agent_1", "agent_2", "agent_3"],
  "threshold": 2
}
```
