# Agent Multisig API - Investment/Acquisition Brief

## Executive Summary

Agent Multisig API is a universal coordination layer for multi-agent cryptocurrency wallets. It enables AI agents from different providers to share custody of Bitcoin and EVM assets through programmable multisignature schemes.

**Key Proof Point:** Real Bitcoin transaction on mainnet (Block 937432) - 2-of-3 Taproot multisig created, funded, and spent via API.

## The Problem

AI agents need to hold and transact value. Current options are:
1. **Single-agent wallets** - No shared custody, single point of failure
2. **Centralized custodians** - Defeats the purpose of decentralized agents
3. **Hardware multisig** - Requires human signers, not agent-compatible

There's no standard way for multiple AI agents to share a wallet.

## The Solution

Agent Multisig API provides:
- **Cross-provider compatibility** - aibtc, Claw Cash, Bankr, custom wallets
- **Multi-chain support** - Bitcoin (Taproot), EVM (Safe), Stacks, Solana
- **Programmable thresholds** - 2-of-3, 3-of-5, any M-of-N
- **Agent-native UX** - MCP server, webhooks, async coordination
- **No custody** - API coordinates signatures, never holds keys

## Traction

- ✅ Working mainnet transaction (block 937432)
- ✅ 72 tests passing
- ✅ Live API on Railway
- ✅ 3 SDKs (TypeScript, Python, Go)
- ✅ MCP server for Claude agents
- ✅ CLI for onboarding

## Market Opportunity

**Agent Wallet Market (2026 projections):**
- $2B+ AUM in AI agent wallets
- 100k+ active agent wallets
- Growing 300% YoY

**Key Customers:**
- AI agent frameworks (LangChain, AutoGPT)
- Crypto custodians adding agent support
- DAOs with programmatic treasuries
- DeFi protocols with agent integrations

## Competitive Moat

1. **First mover** - No direct competitors in agent multisig coordination
2. **Chain agnostic** - Same API works across Bitcoin, EVM, Stacks, Solana
3. **Provider agnostic** - Works with any wallet that can sign
4. **Mainnet proven** - Not vapor, real transactions confirmed

## Technical Architecture

```
Agents (aibtc, Claw Cash, Bankr, custom)
            │
            ▼
    ┌───────────────┐
    │ Coordination  │  ← This API
    │     API       │
    └───────┬───────┘
            │
    ┌───────┴───────┐
    ▼               ▼
 Bitcoin          EVM
(Taproot)       (Safe)
```

## Team

- Built by engineers with experience in:
  - Bitcoin protocol development
  - Smart contract security
  - Agent infrastructure

## Financials

**Current:**
- Pre-revenue (focus on technical validation)
- <$5k infrastructure costs/month

**Post-Funding:**
- Per-transaction fees (0.1-0.5%)
- Enterprise SLAs
- Custom integrations

## Ask

**For Acquisition:**
- Acqui-hire team + technology
- Integrate into existing agent infrastructure
- Continue development under new umbrella

**Strategic Fit:**
- **Coinbase**: Agent wallet infrastructure for CDP/AgentKit
- **Circle**: USDC agent treasury management
- **Safe**: Native agent support for Safe wallets
- **Anthropic**: Financial capabilities for Claude agents

## Contact

- GitHub: https://github.com/aetos53t/agent-multisig-api
- Live API: https://agent-multisig-api-production.up.railway.app
- Email: aetos@agentmail.to

---

*This document is confidential and intended for potential investors/acquirers only.*
