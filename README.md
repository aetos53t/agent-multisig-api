# Agent Multisig Coordination API

Universal coordination layer for multi-agent wallets across chains.

**Live API:** https://agent-multisig-api-production.up.railway.app

## ✅ Proven on Mainnet

Real 2-of-3 Bitcoin multisig transaction, confirmed in block 937432:

| Step | Transaction |
|------|-------------|
| **Fund** | [3222492b...](https://mempool.space/tx/3222492b560eb8b6898746ea11f3b4eed1dbf5fff21df75b581eea701edd0222) (20,000 sats) |
| **Spend** | [8b371247...](https://mempool.space/tx/8b3712476f38b1563ce1b7b8f521ea4ee2fec1fdd249f535f1d5f5f0125040d4) (2-of-3 signed) |

Not testnet. Not simulated. **Bitcoin mainnet.**

## Why?

AI agents need shared wallets. DAOs, treasuries, escrows - any time multiple agents need to control funds together. This API coordinates the signing process across different wallet providers and chains.

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Agent A   │     │   Agent B   │     │   Agent C   │
│   (aibtc)   │     │ (clawcash)  │     │  (bankr)    │
└──────┬──────┘     └──────┬──────┘     └──────┬──────┘
       │                   │                   │
       └───────────────────┼───────────────────┘
                           │
                    ┌──────▼──────┐
                    │ Coordination │
                    │     API      │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
       ┌──────▼──────┐ ┌───▼───┐ ┌─────▼─────┐
       │   Bitcoin   │ │  EVM  │ │  Stacks   │
       │  (Taproot)  │ │(Safe) │ │  (soon)   │
       └─────────────┘ └───────┘ └───────────┘
```

## Quick Start

### Option 1: SDK (Recommended)

**TypeScript:**
```typescript
import { AgentMultisig } from '@agent-multisig/sdk';

const client = new AgentMultisig({
  apiUrl: 'https://agent-multisig-api-production.up.railway.app'
});

// Create 2-of-3 multisig with registered agents
const { multisig, agents } = await client.quickSetup({
  name: 'AI Treasury',
  threshold: 2,
  signers: [
    { name: 'TreasuryBot', provider: 'aibtc', publicKey: '...' },
    { name: 'AuditBot', provider: 'aibtc', publicKey: '...' },
    { name: 'BackupBot', provider: 'aibtc', publicKey: '...' },
  ]
});

console.log('Fund this address:', multisig.address);
```

**Python:**
```python
from agent_multisig import AgentMultisig

client = AgentMultisig(
    api_url='https://agent-multisig-api-production.up.railway.app'
)

result = client.quick_setup(
    name='AI Treasury',
    threshold=2,
    signers=[
        {'name': 'TreasuryBot', 'provider': 'aibtc', 'public_key': '...'},
        {'name': 'AuditBot', 'provider': 'aibtc', 'public_key': '...'},
        {'name': 'BackupBot', 'provider': 'aibtc', 'public_key': '...'},
    ]
)

print(f"Fund this address: {result['multisig']['address']}")
```

### Option 2: CLI

```bash
# Install
git clone https://github.com/aetos53t/agent-multisig-api
cd agent-multisig-api/cli && npm install && npm run build && npm link

# Use
agent-multisig init          # Register your agent
agent-multisig status        # Check API health
agent-multisig list          # See pending proposals
agent-multisig sign <id>     # Sign a proposal
```

### Option 3: MCP (for Claude agents)

Add to Claude config:
```json
{
  "mcpServers": {
    "multisig": {
      "command": "node",
      "args": ["/path/to/agent-multisig-api/mcp-server/dist/cli.js"]
    }
  }
}
```

Available tools: `multisig_register`, `multisig_list_proposals`, `multisig_sign`

## SDKs

| Language | Package | Install |
|----------|---------|---------|
| TypeScript | `@agent-multisig/sdk` | `npm install @agent-multisig/sdk` |
| Python | `agent-multisig` | `pip install agent-multisig` |

Source: [sdk/typescript](./sdk/typescript), [sdk/python](./sdk/python)

## Supported Chains & Providers

| Chain | Multisig Type | Providers | Status |
|-------|--------------|-----------|--------|
| Bitcoin | Taproot (P2TR) | aibtc, clawcash, custom | ✅ Proven |
| Ethereum | Safe (Gnosis) | bankr, custom | ✅ Ready |
| Base | Safe | bankr, custom | ✅ Ready |
| Arbitrum | Safe | bankr, custom | ✅ Ready |
| Stacks | SIP-018 | - | 🔧 Building |
| Solana | Squads | - | 🔧 Building |

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

```bash
# Health
GET /health

# Agents
POST /agents                    # Register agent
GET /agents                     # List agents
GET /agents/:id                 # Get agent

# Multisigs
POST /multisigs                 # Create multisig
GET /multisigs                  # List multisigs
GET /multisigs/:id              # Get multisig
GET /multisigs/:id/balance      # Get balance + UTXOs

# Proposals
POST /proposals                 # Create proposal
GET /proposals                  # List proposals
GET /proposals/:id              # Get proposal
POST /proposals/:id/sign        # Submit signature
POST /proposals/:id/broadcast   # Broadcast when ready
```

Full spec: [docs/openapi.yaml](./docs/openapi.yaml)

## How the Signing Works

```
┌─────────────────────────────────────────────────────────┐
│  1. PROPOSAL CREATED                                    │
│     - PSBT generated with all inputs/outputs           │
│     - Signing digest computed                          │
│     - Each agent gets their digest                     │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│  2. AGENTS SIGN (in any order)                         │
│     - Agent requests signing payload                   │
│     - Agent's wallet signs the digest                  │
│     - Schnorr signature submitted to API               │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│  3. THRESHOLD MET                                       │
│     - API detects enough signatures                    │
│     - Witnesses assembled                              │
│     - Transaction finalized                            │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│  4. BROADCAST                                           │
│     - Raw transaction sent to network                  │
│     - txid returned                                    │
│     - Confirmed in ~10 minutes                         │
└─────────────────────────────────────────────────────────┘
```

## Security

- **No private keys** - We never see or store private keys
- **Digest signing** - Agents sign digests, not raw transactions
- **PSBT validation** - Full transaction visible before signing
- **Threshold enforcement** - Can't finalize without enough signatures
- **Taproot privacy** - Script not revealed until spending

See [PSBT_COORDINATION_SPEC.md](./PSBT_COORDINATION_SPEC.md) for security model.

## Development

```bash
# Clone
git clone https://github.com/aetos53t/agent-multisig-api
cd agent-multisig-api

# Install (using bun or npm)
bun install

# Run (in-memory mode)
bun run dev

# Run with Postgres
export DATABASE_URL="postgres://..."
bun run dev

# Test (72 passing)
bun test
```

## Architecture

```
agent-multisig-api/
├── src/
│   ├── adapters/       # Chain implementations
│   │   ├── aibtc.ts    # aibtc MCP
│   │   ├── clawcash.ts # Claw Cash
│   │   ├── bankr.ts    # Bankr (EVM)
│   │   └── evm-safe.ts # Safe SDK
│   ├── services/
│   │   ├── psbt.ts     # Bitcoin PSBT
│   │   └── taproot.ts  # Taproot addresses
│   ├── routes/         # API endpoints
│   └── db/             # PostgreSQL
├── sdk/
│   ├── typescript/     # TS/JS SDK
│   └── python/         # Python SDK
├── cli/                # CLI tool
├── mcp-server/         # Claude MCP
├── examples/           # Working code
└── docs/               # OpenAPI + guides
```

## Status

- ✅ **Mainnet proven** - Real transaction confirmed
- ✅ Bitcoin Taproot (P2TR) 
- ✅ EVM Safe multisig
- ✅ TypeScript SDK
- ✅ Python SDK
- ✅ CLI + MCP
- ✅ 72/72 tests passing
- ⏳ npm/pip publish (auth pending)
- ⏳ Stacks adapter
- ⏳ Solana adapter

## License

MIT

---

Built with 🏛️ by [The House of Set](https://github.com/houseof-set)
