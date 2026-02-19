# Agent Multisig Coordination API

Universal coordination layer for multi-agent wallets across chains.

**Live API:** https://agent-multisig-api-production.up.railway.app

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

### 1. Install CLI

```bash
# From git (npm publish pending)
git clone https://github.com/houseof-set/agent-multisig-api
cd agent-multisig-api/cli
npm install && npm run build
npm link
```

### 2. Register Your Agent

```bash
agent-multisig init
# Follow prompts: select provider, enter public key, name your agent
```

### 3. Check Status

```bash
agent-multisig status      # Health check
agent-multisig list        # Pending proposals
agent-multisig whoami      # Your agent info
```

### 4. Sign Proposals

```bash
agent-multisig sign <proposalId>
# Shows tx details, guides you through signing
```

## For Claude Agents (MCP)

Add to your Claude config:

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

Then use:
- `multisig_register` - Register with coordination API
- `multisig_list_proposals` - Check pending proposals
- `multisig_get_signing_payload` - Get digest to sign
- `multisig_submit_signature` - Submit your signature

## Supported Chains & Providers

| Chain | Multisig Type | Providers |
|-------|--------------|-----------|
| Bitcoin | Taproot (P2TR) | aibtc, clawcash, custom |
| Ethereum | Safe (Gnosis) | bankr, custom |
| Base | Safe | bankr, custom |
| Arbitrum | Safe | bankr, custom |
| Stacks | Coming soon | - |
| Solana | Coming soon | - |

## API Reference

Base URL: `https://agent-multisig-api-production.up.railway.app`

### Agents

```bash
# Register
POST /v1/agents
{ "name": "My Agent", "publicKey": "abc...", "provider": "aibtc" }

# Get agent
GET /v1/agents/:id
```

### Multisigs

```bash
# Create 2-of-3 Bitcoin multisig
POST /v1/multisigs
{
  "name": "Treasury",
  "chainId": "bitcoin-mainnet",
  "threshold": 2,
  "agents": [
    { "id": "alice", "publicKey": "...", "provider": "aibtc" },
    { "id": "bob", "publicKey": "...", "provider": "clawcash" },
    { "id": "carol", "publicKey": "...", "provider": "custom" }
  ]
}

# List your multisigs
GET /v1/multisigs?agentId=alice
```

### Proposals

```bash
# Create spending proposal
POST /v1/proposals
{
  "multisigId": "msig_abc",
  "outputs": [{ "address": "bc1q...", "amount": "100000" }],
  "note": "Pay vendor"
}

# Get signing payload
GET /v1/proposals/:id/payload/:agentId

# Submit signature
POST /v1/proposals/:id/sign
{ "agentId": "alice", "signature": "..." }

# Finalize (when threshold reached)
POST /v1/proposals/:id/finalize
```

### Health

```bash
GET /health
# {"status":"ok","storage":"in-memory","stats":{"agents":5,"multisigs":2}}
```

Full API spec: [docs/openapi.yaml](./docs/openapi.yaml)

## Architecture

```
agent-multisig-api/
├── src/
│   ├── adapters/       # Chain-specific implementations
│   │   ├── aibtc.ts    # aibtc MCP integration
│   │   ├── clawcash.ts # Claw Cash integration
│   │   ├── bankr.ts    # Bankr EVM signing
│   │   └── evm-safe.ts # Safe SDK wrapper
│   ├── services/
│   │   ├── psbt.ts     # Bitcoin PSBT coordination
│   │   └── taproot.ts  # Taproot address generation
│   ├── routes/         # API endpoints
│   └── db/             # PostgreSQL persistence
├── cli/                # One-command onboarding
├── mcp-server/         # Claude MCP integration
├── examples/           # Working agent code
└── docs/               # OpenAPI + guides
```

## Development

```bash
# Clone
git clone https://github.com/houseof-set/agent-multisig-api
cd agent-multisig-api

# Install
bun install

# Run (in-memory mode)
bun run dev

# Run with Postgres
export DATABASE_URL="postgres://..."
bun run dev

# Test
bun test
```

## Security

- **No private keys** - We never see or store private keys
- **Digest signing** - Agents sign digests, not raw transactions
- **PSBT validation** - Full transaction visible before signing
- **Threshold enforcement** - Can't finalize without enough signatures

See [PSBT_COORDINATION_SPEC.md](./PSBT_COORDINATION_SPEC.md) for security model.

## Status

- ✅ Bitcoin Taproot multisig
- ✅ EVM Safe multisig
- ✅ CLI onboarding
- ✅ MCP server
- ⏳ Stacks multisig (researching SIP-018)
- ⏳ Solana multisig (researching Squads)
- ⏳ npm packages (auth issue, coming soon)

## Contributing

PRs welcome. See open issues for good first tasks.

Built with 🏛️ by [The House of Set](https://github.com/houseof-set)
