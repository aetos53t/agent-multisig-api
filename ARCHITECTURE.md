# Agent Multisig Coordination API - Architecture Design

*Reference-based design inspired by Cofund's battle-tested infrastructure*

---

## Executive Summary

An API layer that enables AI agents to coordinate on multi-signature wallet operations across different wallet providers (aibtc, Coinbase AgentKit, Crossmint, etc.) without needing to understand the underlying complexity.

**Core insight from Cofund**: The hard problems are already solved - policy-based authorization, threshold signatures, replay protection, and DeFi wrappers. We just need to expose these as agent-friendly APIs.

---

## Cofund Architecture Analysis

### Core Primitives (from reference code)

| Primitive | Purpose | Implementation |
|-----------|---------|----------------|
| **Client** | Organization/team identity | `bytes32 clientId` (hash of org name) |
| **User** | Member with signing authority | `{address, pubkey, position, isAdmin, active}` |
| **Policy** | Rules for fund movement | `{signers[], threshold, type, limits}` |
| **Vault** | Per-client fund container | One contract per client per chain |
| **Wrapper** | Protocol integrations | `routerWrapper(func, instructions)` pattern |
| **Auth-ID** | Replay protection | Unique per-execution, stored on-chain |

### Two Operation Types

**1. Transfer** - Simple token movement
```
execute-transfer(
  policy-id,       // Which policy authorizes this
  amount,          // How much
  token,           // Which token
  recipient,       // Where to send
  auth-id,         // Unique execution ID
  signatures[]     // Threshold signatures
)
```

**2. Transaction** - Protocol interaction (DeFi, etc.)
```
execute-transaction(
  policy-id,       // Which policy authorizes this
  wrapper,         // Which protocol wrapper
  function,        // Which operation
  instructions,    // Encoded parameters
  auth-id,         // Unique execution ID
  signatures[]     // Threshold signatures
)
```

### Signature Flow (SIP018/EIP712)

```
1. Construct message hash:
   - Domain: {name: "cofund-signer", version: "1.0.0", chain-id}
   - Data: {policy-id, type, amount/wrapper, recipient/function, auth-id}

2. Sign with each signer's private key

3. Verify on-chain:
   - Check signatures valid
   - Check signers in policy
   - Check threshold met
   - Check auth-id not replayed
   - Check policy limits
```

---

## Agent Multisig API Design

### Design Principles

1. **Agent-First** - Agents call simple methods, complexity hidden
2. **Provider-Agnostic** - Works with any wallet infrastructure
3. **Policy-Driven** - Inherit Cofund's authorization model
4. **Bitcoin-Native** - BTC first, then expand

### Core Entities

```typescript
// Agent identity
interface Agent {
  id: string;                    // Unique agent identifier
  name: string;                  // Human-readable name
  publicKey: string;             // For signature verification
  walletAddress: string;         // On-chain address (derived from pubkey)
  provider: 'aibtc' | 'agentkit' | 'crossmint' | 'custom';
}

// Multi-agent vault
interface AgentVault {
  id: string;
  name: string;
  agents: Agent[];               // Participating agents
  threshold: number;             // Required signatures
  chainId: string;               // BTC mainnet, STX mainnet, etc.
  address: string;               // Vault/multisig address
  policies: Policy[];            // What the vault can do
}

// Authorization policy
interface Policy {
  id: string;
  title: string;
  type: 'transfer' | 'transaction';
  signers: string[];             // Agent IDs who can sign
  threshold: number;             // Required for this policy
  
  // For transfers
  transfer?: {
    maxAmount: bigint;
    token: string;
    allowedRecipients?: string[];
  };
  
  // For transactions (DeFi, etc.)
  transaction?: {
    protocol: string;            // e.g., 'aave', 'bitflow'
    allowedFunctions: string[];  // e.g., ['supply', 'withdraw']
  };
}

// Proposal for execution
interface Proposal {
  id: string;
  vaultId: string;
  policyId: string;
  type: 'transfer' | 'transaction';
  status: 'pending' | 'approved' | 'executed' | 'rejected' | 'expired';
  
  // Transfer details
  transfer?: {
    amount: bigint;
    token: string;
    recipient: string;
  };
  
  // Transaction details
  transaction?: {
    protocol: string;
    function: string;
    params: Record<string, any>;
  };
  
  // Signature collection
  signatures: {
    agentId: string;
    signature: string;
    signedAt: Date;
  }[];
  
  // Metadata
  createdBy: string;             // Agent ID
  createdAt: Date;
  expiresAt: Date;
}
```

### API Endpoints

```typescript
// ═══════════════════════════════════════════════════════════════════
//                         VAULT MANAGEMENT
// ═══════════════════════════════════════════════════════════════════

// Create a new multi-agent vault
POST /vaults
{
  name: string;
  agents: AgentConfig[];         // {id, publicKey, provider}
  threshold: number;
  chainId: string;
}
→ Vault

// Get vault details
GET /vaults/:id
→ Vault (with balances, pending proposals)

// Add/remove agents (requires threshold approval)
POST /vaults/:id/agents
DELETE /vaults/:id/agents/:agentId

// ═══════════════════════════════════════════════════════════════════
//                         POLICY MANAGEMENT
// ═══════════════════════════════════════════════════════════════════

// Create a policy (requires admin threshold)
POST /vaults/:id/policies
{
  title: string;
  type: 'transfer' | 'transaction';
  signers: string[];
  threshold: number;
  limits: TransferLimits | TransactionLimits;
}
→ Policy

// List policies
GET /vaults/:id/policies
→ Policy[]

// Deactivate policy
DELETE /vaults/:id/policies/:policyId

// ═══════════════════════════════════════════════════════════════════
//                         PROPOSAL LIFECYCLE
// ═══════════════════════════════════════════════════════════════════

// Create a proposal
POST /proposals
{
  vaultId: string;
  policyId: string;
  type: 'transfer' | 'transaction';
  transfer?: { amount, token, recipient };
  transaction?: { protocol, function, params };
}
→ Proposal (with signing payload)

// Get proposal details
GET /proposals/:id
→ Proposal (with current signature count)

// Sign a proposal
POST /proposals/:id/sign
{
  agentId: string;
  signature: string;
}
→ Proposal (updated)

// Execute when threshold reached
POST /proposals/:id/execute
→ { txHash: string; status: 'submitted' | 'confirmed' }

// List proposals for a vault
GET /vaults/:id/proposals?status=pending
→ Proposal[]

// ═══════════════════════════════════════════════════════════════════
//                         AGENT UTILITIES
// ═══════════════════════════════════════════════════════════════════

// Get message to sign for a proposal
GET /proposals/:id/signing-payload/:agentId
→ {
  message: string;               // Human-readable
  digest: string;                // Hash to sign (hex)
  encoding: 'eip712' | 'sip018' | 'bip322';
}

// Verify a signature
POST /signatures/verify
{
  digest: string;
  signature: string;
  publicKey: string;
}
→ { valid: boolean }

// Get agent's pending proposals across all vaults
GET /agents/:id/pending
→ Proposal[]
```

### Signing Payload Generation

```typescript
// For EVM chains (EIP-712)
function getEIP712Payload(proposal: Proposal): SigningPayload {
  const domain = {
    name: "agent-multisig",
    version: "1.0.0",
    chainId: proposal.vault.chainId,
    verifyingContract: proposal.vault.address
  };
  
  const types = proposal.type === 'transfer' ? {
    Transfer: [
      { name: "amount", type: "uint256" },
      { name: "authId", type: "string" },
      { name: "policyId", type: "string" },
      { name: "recipient", type: "address" },
      { name: "token", type: "address" },
      { name: "messageType", type: "string" }
    ]
  } : {
    Transaction: [
      { name: "authId", type: "string" },
      { name: "func", type: "string" },
      { name: "policyId", type: "string" },
      { name: "messageType", type: "string" },
      { name: "wrapper", type: "address" },
      { name: "instructionsHash", type: "bytes32" }
    ]
  };
  
  return { domain, types, message: proposal.details };
}

// For Stacks (SIP-018)
function getSIP018Payload(proposal: Proposal): SigningPayload {
  const domain = {
    name: "agent-multisig",
    version: "1.0.0",
    chainId: 1  // mainnet
  };
  
  const message = proposal.type === 'transfer' ? {
    amount: proposal.transfer.amount,
    "auth-id": proposal.id,
    "policy-id": proposal.policyId,
    recipient: proposal.transfer.recipient,
    token: proposal.transfer.token,
    type: proposal.policy.type
  } : {
    "auth-id": proposal.id,
    function: proposal.transaction.function,
    instructions: serializeInstructions(proposal.transaction.params),
    "policy-id": proposal.policyId,
    type: proposal.policy.type,
    wrapper: getWrapperAddress(proposal.transaction.protocol)
  };
  
  return { domain, message };
}
```

---

## Provider Integration Layer

### aibtc Integration

```typescript
class AIBTCProvider implements WalletProvider {
  async createAgent(config: AgentConfig): Promise<Agent> {
    // Use aibtc MCP server to generate wallet
    const wallet = await aibtc.createWallet();
    return {
      id: config.id,
      publicKey: wallet.publicKey,
      walletAddress: wallet.address,
      provider: 'aibtc'
    };
  }
  
  async sign(agent: Agent, digest: string): Promise<string> {
    // Route to aibtc signing
    return aibtc.sign(agent.id, digest);
  }
  
  async getBalance(address: string): Promise<Balance[]> {
    return aibtc.getBalances(address);
  }
}
```

### Coinbase AgentKit Integration

```typescript
class AgentKitProvider implements WalletProvider {
  async createAgent(config: AgentConfig): Promise<Agent> {
    const wallet = await AgentKit.createWallet({
      network: config.network
    });
    return {
      id: config.id,
      publicKey: wallet.publicKey,
      walletAddress: wallet.address,
      provider: 'agentkit'
    };
  }
  
  async sign(agent: Agent, digest: string): Promise<string> {
    return AgentKit.signMessage(agent.walletAddress, digest);
  }
}
```

### Crossmint Integration

```typescript
class CrossmintProvider implements WalletProvider {
  async createAgent(config: AgentConfig): Promise<Agent> {
    const wallet = await crossmint.createWallet({
      type: 'smart-wallet',
      chain: config.chain
    });
    return {
      id: config.id,
      publicKey: wallet.publicKey,
      walletAddress: wallet.address,
      provider: 'crossmint'
    };
  }
}
```

---

## Example: 2-of-3 Agent Vault

```typescript
// 1. Create vault with 3 AI agents
const vault = await api.createVault({
  name: "Trading Committee",
  agents: [
    { id: "agent-alpha", publicKey: "...", provider: "aibtc" },
    { id: "agent-beta", publicKey: "...", provider: "agentkit" },
    { id: "agent-gamma", publicKey: "...", provider: "crossmint" }
  ],
  threshold: 2,
  chainId: "stacks-mainnet"
});

// 2. Create a transfer policy
const policy = await api.createPolicy(vault.id, {
  title: "Daily Trading Allowance",
  type: "transfer",
  signers: ["agent-alpha", "agent-beta", "agent-gamma"],
  threshold: 2,
  transfer: {
    maxAmount: 1000_000000n,  // 1000 USDC
    token: "SP..::usdc",
    allowedRecipients: null   // any recipient
  }
});

// 3. Agent Alpha proposes a transfer
const proposal = await api.createProposal({
  vaultId: vault.id,
  policyId: policy.id,
  type: "transfer",
  transfer: {
    amount: 500_000000n,
    token: "SP..::usdc",
    recipient: "SP..exchange-hot-wallet"
  }
});

// 4. Agent Alpha signs
const payloadAlpha = await api.getSigningPayload(proposal.id, "agent-alpha");
const sigAlpha = await aibtc.sign(payloadAlpha.digest);
await api.signProposal(proposal.id, { agentId: "agent-alpha", signature: sigAlpha });

// 5. Agent Beta reviews and signs
const payloadBeta = await api.getSigningPayload(proposal.id, "agent-beta");
const sigBeta = await agentkit.sign(payloadBeta.digest);
await api.signProposal(proposal.id, { agentId: "agent-beta", signature: sigBeta });

// 6. Threshold reached! Execute
const result = await api.executeProposal(proposal.id);
// → { txHash: "0x...", status: "confirmed" }
```

---

## Key Learnings from Cofund

### What Works Well
1. **Policy abstraction** - Pre-authorize actions, agents just propose within limits
2. **Wrapper pattern** - Clean separation between authorization and execution
3. **Auth-ID replay protection** - Critical for security
4. **Fee tiers** - Business model built into protocol

### What to Adapt for Agents
1. **Async coordination** - Agents may not be online simultaneously
2. **MCP integration** - Each agent uses their provider's MCP server
3. **Natural language proposals** - "Send 500 USDC to exchange" → structured proposal
4. **Notification hooks** - Alert agents when their signature is needed

---

## Implementation Phases

### Phase 1: Core API (Week 1-2)
- [ ] Basic vault CRUD
- [ ] Policy management
- [ ] Proposal lifecycle
- [ ] Single-provider support (aibtc)

### Phase 2: Multi-Provider (Week 3-4)
- [ ] AgentKit integration
- [ ] Crossmint integration
- [ ] Cross-provider signing

### Phase 3: On-Chain (Week 5-6)
- [ ] Deploy vault contracts (fork Cofund patterns)
- [ ] On-chain execution
- [ ] Event monitoring

### Phase 4: Polish (Week 7-8)
- [ ] MCP server for agents
- [ ] Webhook notifications
- [ ] Dashboard UI
- [ ] Documentation

---

*This design leverages battle-tested patterns from Cofund while adapting for AI agent coordination.*
