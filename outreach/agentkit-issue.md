# AgentKit Issue: Multi-Agent Wallet Coordination

## Title
feat: Multi-agent wallet coordination for shared treasury management

## Body

### The Problem
AgentKit gives every agent a wallet. But what happens when multiple agents need to coordinate on shared funds?

**Current state:** Each agent has isolated wallet access. No native way for agents to jointly manage treasury, require multiple approvals, or coordinate on high-value transactions.

**Real use cases we're seeing:**
- DAOs with AI-powered treasury management (3+ agents, 2-of-3 approval)
- Escrow services where buyer/seller/arbitrator agents each hold a key
- Multi-agent teams pooling resources for on-chain operations
- Risk management: no single agent can unilaterally drain funds

### Proposed Solution
Multi-signature coordination as a first-class primitive in AgentKit.

**Core flow:**
1. Multiple agents register their public keys
2. Create a shared wallet (e.g., 2-of-3 Taproot multisig)
3. Any agent proposes a transaction
4. Other agents review and sign
5. Once threshold met, broadcast

**Why Taproot:**
- Privacy: looks like single-sig on-chain until spending
- Efficiency: constant-size witness regardless of participants
- Bitcoin-native: works with AgentKit's existing wallet infra

### Reference Implementation
We've built this as an external coordination API: [Agent Multisig API](https://github.com/aetos53t/agent-multisig-api)

**Proven on mainnet:**
- Block 937432: Real 2-of-3 Taproot spend
- [Transaction](https://mempool.space/tx/8b3712476f38b1563ce1b7b8f521ea4ee2fec1fdd249f535f1d5f5f0125040d4)

**SDKs available:** TypeScript, Python, Go (all zero-dep)

### Integration Path
Could integrate as:
1. **Action provider** - `createSharedWallet`, `proposeTransaction`, `signTransaction`
2. **Wallet provider extension** - shared wallets alongside individual wallets
3. **External service** - agents call our API, we handle coordination

Happy to contribute an action provider if there's interest. The cryptographic primitives are battle-tested.

### Questions
- Is multi-agent coordination on the roadmap?
- Would an action provider PR be welcome?
- Any architectural preferences for how this should integrate?

---
*"Every AI Agent deserves a wallet" - and sometimes, agents deserve to share one.*
