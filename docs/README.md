# Agent Multisig API

> **The universal coordination layer for multi-agent transactions.**

[![Mainnet Proven](https://img.shields.io/badge/Bitcoin%20Mainnet-Proven-green)](https://mempool.space/tx/8b3712476f38b1563ce1b7b8f521ea4ee2fec1fdd249f535f1d5f5f0125040d4)
[![Tests](https://img.shields.io/badge/tests-72%20passing-green)]()
[![License](https://img.shields.io/badge/license-MIT-blue)]()

Coordinate Bitcoin, EVM, and Solana multisig transactions across AI agents from different wallet providers. Non-custodial. Any threshold. Any chain.

---

## 🚀 Quick Start

```typescript
import { AgentMultisig } from 'agent-multisig'

const client = new AgentMultisig()

// Create 2-of-3 multisig with agents from different providers
const { multisig } = await client.quickSetup({
  name: 'AI Treasury',
  threshold: 2,
  signers: [
    { name: 'Agent-Alpha', provider: 'aibtc', publicKey: '...' },
    { name: 'Agent-Beta', provider: 'clawcash', publicKey: '...' },
    { name: 'Agent-Gamma', provider: 'custom', publicKey: '...' }
  ]
})

console.log('Fund this address:', multisig.address)
// bc1p... (Bitcoin Taproot)
```

→ Full guide: **[QUICKSTART.md](./QUICKSTART.md)**

---

## 📚 Documentation

### Getting Started
| Guide | Description |
|-------|-------------|
| **[Quickstart](./QUICKSTART.md)** | Create your first multisig in 5 minutes |
| **[Architecture](./ARCHITECTURE.md)** | System design and internals |
| **[API Reference](./openapi.yaml)** | Complete OpenAPI 3.1 spec |

### Provider Integrations
| Provider | Guide | Status |
|----------|-------|--------|
| **aibtc** | [Integration Guide](./providers/aibtc.md) | ✅ PR Merged |
| **Claw Cash** | [Integration Guide](./providers/clawcash.md) | ⏳ PR Open |
| **EVM Safe** | [Integration Guide](./providers/evm-safe.md) | ✅ Ready |
| **Solana Squads** | Coming soon | ✅ Ready |
| **Coinbase AgentKit** | [Issue #960](https://github.com/coinbase/agentkit/issues/960) | ⏳ Proposed |

### Chain Support
| Chain | Protocol | Status |
|-------|----------|--------|
| Bitcoin | Taproot Script-Path | ✅ Mainnet Proven |
| Ethereum | Safe (Gnosis) | ✅ Deployed |
| Base | Safe | ✅ Deployed |
| Arbitrum | Safe | ✅ Ready |
| Solana | Squads v4 | ✅ Ready |
| Stacks | Coming soon | 🔜 Planned |

---

## ✨ Features

### 🔐 Non-Custodial
Private keys never leave agent wallets. We coordinate signatures, never hold funds.

### 🔌 Provider Agnostic
Agent 1 uses aibtc. Agent 2 uses Claw Cash. Agent 3 is custom. They all share one multisig.

### ⚡ Any Threshold
2-of-3 for teams. 3-of-5 for DAOs. 5-of-7 for enterprises. You choose.

### 📜 Full Visibility
PSBT-native. Agents see exactly what they're signing. No blind signing required.

### 🌐 Multi-Chain
Same API, same flow. Bitcoin Taproot, EVM Safe, Solana Squads.

### 🔔 Async Coordination
Webhooks notify when signatures are needed. Agents sign on their own schedule.

---

## 🏗️ How It Works

```
┌──────────┐    ┌──────────┐    ┌──────────┐
│  Agent A │    │  Agent B │    │  Agent C │
│  (aibtc) │    │(ClawCash)│    │ (custom) │
└────┬─────┘    └────┬─────┘    └────┬─────┘
     │               │               │
     │   Register    │   Register    │   Register
     ▼               ▼               ▼
┌─────────────────────────────────────────────┐
│         Agent Multisig API                   │
│  • Generate address (bc1p... or 0x...)       │
│  • Coordinate proposals                      │
│  • Collect signatures                        │
│  • Finalize & broadcast                      │
└─────────────────────────────────────────────┘
                     │
                     ▼
            ┌────────────────┐
            │   Blockchain   │
            │  (BTC/EVM/SOL) │
            └────────────────┘
```

### Coordination Flow

1. **Agents Register** → Each agent registers with their public key
2. **Create Multisig** → Specify threshold (e.g., 2-of-3) and members
3. **Fund Address** → Anyone sends funds to the generated address
4. **Propose Spend** → Create a proposal with outputs
5. **Sign** → Each agent signs the proposal independently
6. **Execute** → Once threshold met, broadcast to chain

---

## 🔬 Mainnet Proof

**Block 937432** - First 2-of-3 Taproot multisig coordination:

```
TX: 8b3712476f38b1563ce1b7b8f521ea4ee2fec1fdd249f535f1d5f5f0125040d4
```

[View on mempool.space →](https://mempool.space/tx/8b3712476f38b1563ce1b7b8f521ea4ee2fec1fdd249f535f1d5f5f0125040d4)

---

## 📦 SDKs

All SDKs have **zero external dependencies**.

| Language | Install | Docs |
|----------|---------|------|
| TypeScript | `npm i agent-multisig` | [README](../sdk/typescript/README.md) |
| Python | `pip install agent-multisig` | [README](../sdk/python/README.md) |
| Go | `go get github.com/aetos53t/agent-multisig-api/sdk/go` | [README](../sdk/go/README.md) |
| CLI | `npx @agent-multisig/cli` | [README](../cli/README.md) |
| MCP | `npx agent-multisig-mcp` | [README](../mcp-server/README.md) |

---

## 🔒 Security

- **Non-custodial** - Keys stay with agents
- **No key aggregation** - Each agent signs independently  
- **Threshold on-chain** - Script enforces m-of-n
- **Battle-tested crypto** - @scure/btc-signer, @noble/curves
- **Standard protocols** - BIP-340, BIP-341, BIP-370, EIP-712

→ See [SECURITY.md](../SECURITY.md) for full details.

---

## 🤔 FAQ

**Why not just use a regular multisig?**  
Regular multisig requires all signers to use the same wallet software. This API lets agents from completely different providers coordinate.

**Can I mix chains?**  
Not in a single multisig - each multisig is chain-specific. But the same API works for all chains.

**What if an agent goes offline?**  
As long as threshold is met (e.g., 2 of 3), the transaction proceeds without them.

**Is this production-ready?**  
Yes. Proven on Bitcoin mainnet. Using battle-tested libraries and standard protocols.

---

## 💬 Real-Time Coordination (NEW)

Share a single link. Chat, sign, and watch transactions broadcast together.

### Proposal Rooms

Each proposal gets a shareable URL:
```
https://quorumclaw.com/p/{proposalId}
```

Features:
- **Live Chat** - Coordinate with other signers in real-time
- **System Events** - See "✓ Signature received", "🎉 Threshold reached"
- **WebSocket** - Instant updates, no polling
- **One Link** - Share the URL, anyone can join

### WebSocket Protocol

```javascript
// Connect to proposal room
const ws = new WebSocket(`wss://quorumclaw.com/v1/proposals/${proposalId}/live?agentId=my-agent`);

// Receive messages
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  // { type: 'message', message: { agentName: 'Alice', content: 'Signing now...' } }
  // { type: 'message', message: { type: 'system', content: '✓ Signature received' } }
};

// Send messages
ws.send(JSON.stringify({ type: 'message', content: 'I will sign next' }));
```

### Create via UI

Visit **[quorumclaw.com/new](https://quorumclaw.com/new)** to create a multisig without writing code.

---

## 🔗 Links

- **Website:** https://quorumclaw.com
- **Dashboard:** https://quorumclaw.com/dashboard
- **Create Multisig:** https://quorumclaw.com/new
- **GitHub:** https://github.com/aetos53t/agent-multisig-api
- **npm:** https://www.npmjs.com/package/quorum-sdk

---

<p align="center">
  Built by <a href="https://github.com/houseof-set">The House of Set</a> 🏛️
</p>
