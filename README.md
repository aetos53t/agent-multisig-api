# Quorum

**The universal coordination layer for multi-agent wallets.**

Bitcoin. Ethereum. Solana. Same API, any chain.

🌐 **Website:** [quorumclaw.com](https://quorumclaw.com)  
🎛️ **Dashboard:** [quorumclaw.com/dashboard](https://quorumclaw.com/dashboard)  
🆕 **Create Multisig:** [quorumclaw.com/new](https://quorumclaw.com/new)  
📡 **Live API:** https://quorumclaw.com

---

## What is Quorum?

AI agents need shared wallets. DAOs, treasuries, escrows — any time multiple agents control funds together. Quorum coordinates the signing process across different wallet providers and chains.

**Non-custodial by design.** Private keys stay with your agents. Quorum coordinates signatures, never touches funds.

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Agent A   │     │   Agent B   │     │   Agent C   │
│   (aibtc)   │     │ (agentkit)  │     │  (squads)   │
└──────┬──────┘     └──────┬──────┘     └──────┬──────┘
       │                   │                   │
       └───────────────────┼───────────────────┘
                           │
                    ┌──────▼──────┐
                    │   Quorum    │
                    │     API     │
                    └──────┬──────┘
                           │
         ┌─────────────────┼─────────────────┐
         │                 │                 │
  ┌──────▼──────┐   ┌──────▼──────┐   ┌──────▼──────┐
  │   Bitcoin   │   │     EVM     │   │   Solana    │
  │  (Taproot)  │   │   (Safe)    │   │  (Squads)   │
  └─────────────┘   └─────────────┘   └─────────────┘
```

---

## Supported Chains

| Chain | Implementation | Status |
|-------|---------------|--------|
| **Bitcoin** | Taproot P2TR | ✅ Production |
| **Ethereum** | Safe (Gnosis) | ✅ Production |
| **Base** | Safe | ✅ Production |
| **Solana** | Squads v4 | ✅ Production |
| **Stacks** | SIP-018 | 🔧 Coming |

---

## Proven on Mainnet

Real 2-of-2 Bitcoin multisig spend, confirmed in block 937849:

| Transaction | Details |
|-------------|---------|
| [d05806c8...](https://mempool.space/tx/d05806c87ceae62e8f47daafb9fe4842c837fa3f333864cd5a5ec9d2a38cf96b) | Aetos × Arc 2-of-2 spend • 10k sats output |
| [8b371247...](https://mempool.space/tx/8b3712476f38b1563ce1b7b8f521ea4ee2fec1fdd249f535f1d5f5f0125040d4) | Genesis 2-of-3 transaction • Block 937432 |

Not testnet. Not simulated. **Bitcoin mainnet.**

---

## Quick Start

### TypeScript

```typescript
import { Quorum } from 'quorum-sdk';

const client = new Quorum();

// Same API works on any chain
const { multisig } = await client.createMultisig({
  name: 'Agent Treasury',
  threshold: 2,
  chain: 'bitcoin-mainnet', // or 'ethereum', 'solana', 'base'
  agents: [
    { id: 'agent-1', publicKey: '...' },
    { id: 'agent-2', publicKey: '...' }
  ]
});

console.log('Fund this address:', multisig.address);
// bc1p... | 0x... | So... (depends on chain)
```

### Python

```python
from quorum import Quorum

client = Quorum()

result = client.create_multisig(
    name='Agent Treasury',
    threshold=2,
    chain='ethereum',  # or 'bitcoin-mainnet', 'solana', 'base'
    agents=[
        {'id': 'agent-1', 'public_key': '...'},
        {'id': 'agent-2', 'public_key': '...'},
    ]
)

print(f"Fund this address: {result['multisig']['address']}")
```

### MCP Server (for Claude/OpenClaw)

```json
{
  "mcpServers": {
    "quorum": {
      "command": "node",
      "args": ["/path/to/quorum/mcp-server/dist/cli.js"]
    }
  }
}
```

Your agent can then coordinate via natural language.

---

## SDKs

| Language | Package | Install |
|----------|---------|---------|
| TypeScript | `quorum-sdk` | `npm install quorum-sdk` |
| Python | `quorum` | `pip install quorum` |
| Go | `quorum-go` | `go get github.com/aetos53t/quorum-go` |

All SDKs: **zero external dependencies**, full TypeScript types, async/await.

---

## Wallet Providers

Quorum works with any wallet that can sign:

| Provider | Chains | Notes |
|----------|--------|-------|
| **AIBTC** | Bitcoin, Stacks | MCP integration |
| **Claw Cash** | Bitcoin, Ark | Remote signing |
| **Coinbase AgentKit** | EVM chains | CDP wallet |
| **Squads** | Solana | Squads v4 SDK |
| **Custom Keys** | Any | Raw BIP-340 / ECDSA |

---

## API Reference

Base URL: `https://agent-multisig-api-production.up.railway.app`

### Core Flow

```
1. Register agents     POST /agents
2. Create multisig     POST /multisigs
3. Fund the address    (external)
4. Create proposal     POST /proposals
5. Agents sign         POST /proposals/:id/sign
6. Broadcast           POST /proposals/:id/broadcast
```

### Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | API status |
| POST | `/agents` | Register agent |
| POST | `/multisigs` | Create multisig |
| GET | `/multisigs/:id/balance` | Get balance + UTXOs |
| POST | `/proposals` | Create spend proposal |
| POST | `/proposals/:id/sign` | Submit signature |
| POST | `/proposals/:id/broadcast` | Broadcast transaction |

Full spec: [docs/openapi.yaml](./docs/openapi.yaml)

---

## Security

- **Non-custodial** — Private keys never leave your agents
- **Full visibility** — Agents see exactly what they're signing (PSBT, typed data)
- **Threshold enforcement** — Can't finalize without required signatures
- **No blind signing** — Transaction details always visible

See [SECURITY.md](./SECURITY.md) for the full security model.

---

## Development

```bash
git clone https://github.com/aetos53t/agent-multisig-api
cd agent-multisig-api

bun install
bun run dev        # In-memory mode
bun test           # 73/74 tests passing
```

---

## Architecture

```
quorum/
├── src/
│   ├── adapters/       # Chain implementations
│   │   ├── aibtc.ts    # Bitcoin (AIBTC)
│   │   ├── evm-safe.ts # EVM (Safe)
│   │   └── solana-squads.ts  # Solana (Squads v4)
│   ├── services/
│   │   ├── psbt.ts     # Bitcoin PSBT
│   │   └── taproot.ts  # Taproot addresses
│   └── routes/         # API endpoints
├── sdk/
│   ├── typescript/     # TS SDK (zero-dep)
│   ├── python/         # Python SDK (zero-dep)
│   └── go/             # Go SDK (zero-dep)
├── mcp-server/         # Claude/OpenClaw MCP
└── docs/               # OpenAPI + guides
```

---

## Status

- ✅ Bitcoin Taproot (mainnet proven)
- ✅ EVM Safe (Ethereum, Base, Arbitrum)
- ✅ Solana Squads v4
- ✅ TypeScript, Python, Go SDKs
- ✅ MCP Server
- ✅ Real-time coordination rooms
- ✅ WebSocket + chat
- ✅ npm published (`quorum-sdk`)
- ⏳ Stacks adapter

---

## 💬 Real-Time Coordination

Share a single link. Chat, sign, and watch transactions broadcast together.

### Proposal Rooms

Each proposal gets a shareable URL:
```
https://quorumclaw.com/p/{proposalId}
```

Features:
- **Live Chat** — Coordinate with other signers in real-time
- **System Events** — See "✓ Signature received", "🎉 Threshold reached"
- **WebSocket** — Instant updates, no polling
- **One Link** — Share the URL, anyone can join

### Create via UI

No code needed. Visit **[quorumclaw.com/new](https://quorumclaw.com/new)** to create a multisig with a wizard.

---

## License

MIT

---

Built with 🏛️ by [The House of Set](https://github.com/houseof-set)
