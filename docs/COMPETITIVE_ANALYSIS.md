# Competitive Analysis

## Market Positioning

Agent Multisig API occupies a unique position: **multi-agent wallet coordination**. No direct competitors exist in this exact space.

## Adjacent Solutions

### Traditional Multisig Providers

| Provider | Agent Support | Multi-Chain | Programmable |
|----------|---------------|-------------|--------------|
| Gnosis Safe | ❌ Human signers | ✅ EVM only | ⚠️ Limited |
| Casa | ❌ Human signers | ❌ Bitcoin only | ❌ No |
| Unchained | ❌ Human signers | ❌ Bitcoin only | ❌ No |
| **Agent Multisig** | ✅ **Agent-first** | ✅ **Multi-chain** | ✅ **Full API** |

**Gap:** Traditional multisig requires humans with hardware wallets. Not agent-compatible.

### Agent Wallet Providers

| Provider | Multi-party | Custody Model | Chain Support |
|----------|-------------|---------------|---------------|
| aibtc | ❌ Single agent | Self-custody | BTC + STX |
| Coinbase AgentKit | ❌ Single agent | Coinbase custody | EVM |
| Claw Cash | ❌ Single agent | Self-custody | BTC |
| Bankr | ❌ Single agent | Self-custody | EVM |
| **Agent Multisig** | ✅ **Multi-agent** | **Coordination** | **All** |

**Gap:** Existing agent wallets are single-owner. No shared custody option.

### MPC Custody

| Provider | Use Case | Latency | Cost |
|----------|----------|---------|------|
| Fireblocks | Institutional | ~3s | $$$ |
| Fordefi | Enterprise | ~2s | $$ |
| Copper | Trading | ~1s | $$$ |
| **Agent Multisig** | **Agents** | **<1s** | **Free API** |

**Gap:** MPC solutions target institutions with human approval flows, not autonomous agents.

## Why We Win

### 1. Agent-Native Design

Built for autonomous software, not humans:
- Webhook notifications when signatures needed
- MCP server for Claude integration
- No human-in-the-loop requirements
- Sub-second coordination latency

### 2. Provider Agnostic

Works with ANY wallet that can sign:
```
aibtc → Agent Multisig ← Claw Cash
           ↑
        Bankr
```

Not locked into one ecosystem.

### 3. Chain Agnostic

Same API, any blockchain:
- Bitcoin: Taproot P2TR with CHECKSIGADD
- EVM: Safe contracts (battle-tested $100B+)
- Stacks: SIP-018 (coming soon)
- Solana: Squads Protocol (coming soon)

### 4. No Custody Risk

We never hold keys or funds:
- Keys stay with agents
- We only coordinate signatures
- Verifiable on-chain

### 5. Mainnet Proven

Not vapor. Real transaction:
- [Block 937432](https://mempool.space/tx/8b3712476f38b1563ce1b7b8f521ea4ee2fec1fdd249f535f1d5f5f0125040d4)
- 2-of-3 Taproot multisig
- Created, funded, and spent via API

## Potential Competition

### If Coinbase Builds This
- Would be locked to their custody model
- Limited to their supported chains
- We're provider-agnostic (including Coinbase)

### If Safe Builds This
- Would be EVM-only
- No Bitcoin support
- We integrate Safe for EVM while supporting Bitcoin natively

### If aibtc Adds Multisig
- Would be aibtc-wallet only
- We coordinate across aibtc, Claw Cash, Bankr, and any custom wallet

## Defensibility

1. **Network effects**: As more agents register, the coordination graph becomes more valuable
2. **Integration depth**: Deep integrations with multiple providers
3. **Standards leadership**: Defining how agents coordinate wallets
4. **First-mover**: Already proven on mainnet while others are conceptual

## Target Acquirers

| Company | Strategic Fit | Integration Path |
|---------|---------------|------------------|
| **Coinbase** | Agent infra for CDP | Add to AgentKit |
| **Circle** | USDC agent treasury | Circle APIs |
| **Safe** | Agent support for Safe | Safe ecosystem |
| **Anthropic** | Claude financial capabilities | Built-in tools |
| **OpenAI** | Agent commerce | Native integration |

## Bottom Line

Agent Multisig API is the only solution for multi-agent cryptocurrency custody. As AI agents increasingly hold and transact value, this becomes critical infrastructure.

The question isn't whether this market exists - it's who will own it.
