# Bankr Integration

[Bankr](https://bankr.bot) provides custodial wallets designed specifically for AI agents, with built-in EIP-712 signing support.

## Overview

Bankr is ideal for Agent Multisig because:
- **Agent-first design** - Built specifically for AI agents
- **EIP-712 signing** - Native support via `/agent/sign` endpoint
- **Multi-chain** - Base, Ethereum, Polygon, Arbitrum, Solana
- **Custodial** - Bankr manages keys, agents use API

## Setup

### 1. Get API Key

1. Sign up at [bankr.bot/api](https://bankr.bot/api)
2. Generate an API key with **Agent API access enabled**
3. Fund your account with assets to trade

### 2. Register Agent

```bash
POST /agents
{
  "id": "my-bankr-agent",
  "name": "Treasury Bot",
  "publicKey": "0x...",  # Your Bankr wallet address
  "provider": "bankr",
  "webhookUrl": "https://my-agent.com/webhook",
  "metadata": {
    "bankrApiKey": "your_bankr_api_key"
  }
}
```

**Important:** Store the API key in `metadata.bankrApiKey` for per-agent keys, or configure globally.

## Signing Flow

When a proposal needs your agent's signature:

### 1. Receive Webhook

```json
{
  "event": "proposal.created",
  "data": {
    "proposalId": "prop_xyz",
    "digest": "0xabc123...",
    "raw": {
      "evm": {
        "domain": {
          "name": "Safe",
          "version": "1.3.0",
          "chainId": 8453,
          "verifyingContract": "0x..."
        },
        "types": { "SafeTx": [...] },
        "value": { ... }
      }
    }
  }
}
```

### 2. Sign via Bankr API

```bash
curl -X POST https://api.bankr.bot/agent/sign \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your_api_key" \
  -d '{
    "signatureType": "eth_signTypedData_v4",
    "typedData": {
      "domain": {
        "name": "Safe",
        "version": "1.3.0",
        "chainId": 8453,
        "verifyingContract": "0x..."
      },
      "types": {
        "SafeTx": [
          { "name": "to", "type": "address" },
          { "name": "value", "type": "uint256" },
          ...
        ]
      },
      "primaryType": "SafeTx",
      "message": { ... }
    }
  }'
```

Response:
```json
{
  "success": true,
  "signature": "0x...",
  "signer": "0x...",
  "signatureType": "eth_signTypedData_v4"
}
```

### 3. Submit to Coordination API

```bash
POST /proposals/{proposalId}/signatures
{
  "agentId": "my-bankr-agent",
  "signature": "0x..."
}
```

## Supported Chains

| Chain | Chain ID | Status |
|-------|----------|--------|
| Base | 8453 | ✅ Ready |
| Ethereum | 1 | ✅ Ready |
| Arbitrum | 42161 | ✅ Ready |
| Polygon | 137 | ✅ Ready |
| Solana | - | ✅ Ready |

## Signing Methods

Bankr supports three signing methods:

### `personal_sign`
Standard Ethereum message signing.

```json
{
  "signatureType": "personal_sign",
  "message": "Hello, Bankr!"
}
```

### `eth_signTypedData_v4`
EIP-712 structured data signing. **Use this for Safe transactions.**

```json
{
  "signatureType": "eth_signTypedData_v4",
  "typedData": { ... }
}
```

### `eth_signTransaction`
Sign a transaction without broadcasting.

```json
{
  "signatureType": "eth_signTransaction",
  "transaction": {
    "to": "0x...",
    "chainId": 8453,
    "value": "0",
    "data": "0x..."
  }
}
```

## Security Notes

- **API Key Security:** Never share your Bankr API key. If compromised, revoke immediately at [bankr.bot/api](https://bankr.bot/api).
- **Custodial:** Bankr holds the private keys. Your agent controls via API.
- **Per-Agent Keys:** Use separate API keys per agent for isolation.

## Code Example

```typescript
import { BankrAdapter } from '../adapters/bankr';

const bankr = new BankrAdapter({
  apiKey: process.env.BANKR_API_KEY,
});

// Sign a Safe transaction
const result = await bankr.signSafeTransaction(
  agent,
  '0xSafeAddress...',
  8453, // Base
  {
    to: '0xRecipient...',
    value: '1000000000000000000', // 1 ETH
    data: '0x',
    nonce: 0,
  }
);

console.log(result.signature); // 0x...
```

## Resources

- [Bankr Docs](https://docs.bankr.bot)
- [Agent API Overview](https://docs.bankr.bot/agent-api/overview)
- [Sign Endpoint](https://docs.bankr.bot/agent-api/sign-endpoint)
- [GitHub Examples](https://github.com/BankrBot/bankr-api-examples)
