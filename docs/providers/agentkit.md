# Coinbase AgentKit Integration

> Enable multi-agent wallet coordination for AgentKit-powered agents.

## Overview

[AgentKit](https://github.com/coinbase/agentkit) gives every agent a wallet. Agent Multisig API extends this with shared wallets - multiple agents coordinating on joint funds with threshold signatures.

## Use Cases

- **DAO Treasury**: 3 AI agents manage funds, 2-of-3 required for spending
- **Escrow**: Buyer + Seller + Arbitrator agents, 2-of-3 to release
- **Team Pooling**: Multiple specialized agents share operational budget
- **Risk Management**: No single agent can drain treasury

## Integration

### 1. Each Agent Registers

```typescript
// In your AgentKit agent initialization
import { AgentMultisig } from '@agent-multisig/sdk';

const multisig = new AgentMultisig('https://api.agent-multisig.com');

// Generate or load agent's key
const { privateKey, publicKey } = await generateTaprootKey();

// Register with coordination API
const agent = await multisig.registerAgent({
  name: 'treasury-agent-alpha',
  publicKey,
  provider: 'agentkit',
  metadata: { role: 'primary-signer' }
});
```

### 2. Create Shared Wallet

```typescript
// Any agent can initiate
const wallet = await multisig.createMultisig({
  name: 'dao-treasury',
  chain: 'bitcoin',
  threshold: 2, // 2-of-3
  agents: [agent1.id, agent2.id, agent3.id],
  policies: {
    maxTxSize: '1 BTC',
    cooldownMinutes: 10
  }
});

// All agents receive the shared Taproot address
console.log(wallet.address); // bc1p...
```

### 3. Propose Transactions

```typescript
// Agent proposes a spend
const proposal = await multisig.createProposal({
  multisigId: wallet.id,
  type: 'bitcoin_transfer',
  outputs: [
    { address: 'bc1q...recipient', amount: 50000 } // sats
  ],
  memo: 'Monthly operational expense'
});

// Other agents notified via webhook
```

### 4. Sign When Ready

```typescript
// Each agent reviews and signs
const validated = await validateProposal(proposal);
if (validated.safe) {
  const signature = signWithPrivateKey(proposal.sighash, privateKey);
  await multisig.signProposal(proposal.id, signature);
}

// When threshold met, auto-broadcast
```

## Action Provider (Coming Soon)

We're building an AgentKit action provider for native integration:

```typescript
import { multisigActions } from '@agent-multisig/agentkit';

const agent = new Agent({
  actions: [
    ...defaultActions,
    ...multisigActions
  ]
});

// Agent can now use natural language:
// "Create a 2-of-3 treasury with agents X, Y, Z"
// "Propose sending 0.1 BTC to bc1q..."
// "Sign the pending treasury proposal"
```

## Security

- **PSBT-based**: Full transaction visibility before signing
- **Threshold enforcement**: On-chain, not just API-level
- **Taproot privacy**: Multisig indistinguishable from single-sig
- **Webhook verification**: Signed payloads prevent spoofing

## Mainnet Proven

Real 2-of-3 Taproot transaction confirmed block 937432:
- [mempool.space](https://mempool.space/tx/8b3712476f38b1563ce1b7b8f521ea4ee2fec1fdd249f535f1d5f5f0125040d4)

## Resources

- [GitHub](https://github.com/aetos53t/agent-multisig-api)
- [Live API](https://agent-multisig-api-production.up.railway.app)
- [TypeScript SDK](../sdk/typescript/)
- [Full Documentation](https://agent-multisig-api-production.up.railway.app/docs)

## Questions?

Open an issue or reach out on [GitHub](https://github.com/aetos53t/agent-multisig-api/issues).
