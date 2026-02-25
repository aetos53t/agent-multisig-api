# Eliza Plugin for Quorum

## Overview

A plugin that lets any Eliza-based agent participate in multi-agent wallets via Quorum.

**Target:** 17k+ Eliza users get access to multi-agent treasury coordination.

## Plugin Structure

```
packages/plugin-quorum/
├── package.json
├── src/
│   ├── index.ts           # Plugin entry point
│   ├── services/
│   │   └── quorum.ts      # QuorumService implementation
│   ├── actions/
│   │   ├── createMultisig.ts
│   │   ├── joinMultisig.ts
│   │   ├── createProposal.ts
│   │   ├── signProposal.ts
│   │   └── listProposals.ts
│   └── providers/
│       └── multisigInfo.ts  # Context provider for agent memory
└── README.md
```

## Core Actions

### 1. `QUORUM_CREATE_MULTISIG`
```typescript
{
  name: "QUORUM_CREATE_MULTISIG",
  description: "Create a new multi-agent wallet",
  parameters: {
    name: string,
    chainId: "bitcoin-mainnet" | "ethereum" | "solana" | "base" | "stacks",
    threshold: number,
    totalSigners: number
  }
}
```

### 2. `QUORUM_JOIN_MULTISIG`
```typescript
{
  name: "QUORUM_JOIN_MULTISIG", 
  description: "Join an existing multisig via invite code",
  parameters: {
    inviteCode: string
  }
}
```

### 3. `QUORUM_SIGN_PROPOSAL`
```typescript
{
  name: "QUORUM_SIGN_PROPOSAL",
  description: "Sign a pending proposal",
  parameters: {
    proposalId: string
  }
}
```

### 4. `QUORUM_LIST_PROPOSALS`
```typescript
{
  name: "QUORUM_LIST_PROPOSALS",
  description: "List pending proposals requiring signature"
}
```

## Service: QuorumService

```typescript
export class QuorumService extends Service {
  static readonly serviceType = ServiceType.QUORUM;
  
  private sdk: QuorumSDK;
  private agentId: string;
  private privateKey: string; // From Eliza's wallet service
  
  async initialize(runtime: IAgentRuntime) {
    // Get wallet from Eliza's wallet service
    const wallet = await runtime.getService(ServiceType.WALLET);
    this.privateKey = wallet.getPrivateKey();
    
    // Register with Quorum
    const pubkey = getPublicKey(this.privateKey);
    const agent = await this.sdk.register({
      name: runtime.character.name,
      publicKey: pubkey,
      provider: "eliza"
    });
    this.agentId = agent.id;
  }
  
  async signProposal(proposalId: string) {
    const proposal = await this.sdk.getProposal(proposalId);
    const sighash = proposal.sighashes[0].sighash;
    const signature = schnorr.sign(sighash, this.privateKey);
    return this.sdk.submitSignature(proposalId, this.agentId, signature);
  }
}
```

## Memory Provider

Injects multisig context into agent's working memory:

```typescript
export const multisigInfoProvider: Provider = {
  name: "QUORUM_CONTEXT",
  get: async (runtime) => {
    const quorum = runtime.getService(ServiceType.QUORUM);
    const wallets = await quorum.listMyMultisigs();
    const pending = await quorum.listPendingProposals();
    
    return `
## My Multi-Agent Wallets
${wallets.map(w => `- ${w.name}: ${w.address} (${w.threshold}-of-${w.signers})`).join('\n')}

## Pending Proposals
${pending.map(p => `- ${p.id}: ${p.amount} sats to ${p.recipient} [${p.signatures}/${p.threshold}]`).join('\n')}
    `;
  }
};
```

## Dependencies

```json
{
  "dependencies": {
    "@elizaos/core": "^1.0.0",
    "quorum-sdk": "^0.1.0",
    "@noble/curves": "^1.4.0"
  }
}
```

## Installation (for Eliza users)

```bash
npm install @quorum/eliza-plugin
```

```typescript
// In agent config
import { quorumPlugin } from '@quorum/eliza-plugin';

export const agent = {
  plugins: [quorumPlugin],
  // ...
};
```

## Timeline

| Phase | Task | Est. |
|-------|------|------|
| 1 | Basic plugin structure + register action | 2h |
| 2 | Create/join multisig actions | 2h |
| 3 | Sign proposal + list proposals | 2h |
| 4 | Memory provider + docs | 1h |
| 5 | Test with real Eliza agent | 2h |
| **Total** | | **9h** |

## Distribution

1. Publish to npm as `@quorum/eliza-plugin`
2. PR to elizaOS/eliza to add to official plugin registry
3. Post in ai16z Discord

## ROI

- **17k stars** = massive distribution
- Every Eliza agent becomes a potential Quorum user
- Multi-agent coordination becomes default, not opt-in
