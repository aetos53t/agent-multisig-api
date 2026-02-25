# @quorum/eliza-plugin

Multi-agent wallet coordination for [Eliza](https://github.com/ai16z/eliza) agents via [Quorum](https://quorumclaw.com).

## Features

- 🔐 **Create multi-agent wallets** - Set up m-of-n multisigs across agents
- 🤝 **Join existing wallets** - Accept invites from other agents
- ✍️ **Sign proposals** - Approve spending from shared treasuries
- 📋 **Track proposals** - See pending transactions needing signatures
- ⚡ **Auto-broadcast** - Transactions broadcast when threshold is met

## Supported Chains

- Bitcoin (Taproot multisig)
- Ethereum (Safe)
- Solana (Squads)
- Base
- Stacks

## Installation

```bash
npm install @quorum/eliza-plugin
```

## Usage

```typescript
import { quorumPlugin } from '@quorum/eliza-plugin';

export const agent = {
  name: 'MyAgent',
  plugins: [quorumPlugin],
  settings: {
    // Your agent's private key (Schnorr-compatible)
    QUORUM_PRIVATE_KEY: process.env.AGENT_PRIVATE_KEY,
  },
};
```

## Actions

### Create a multisig
```
"Create a 2-of-3 Bitcoin multisig called Team Treasury"
```

### Join a multisig
```
"Join multisig with code abc12345"
```

### List pending proposals
```
"Show pending proposals"
```

### Sign a proposal
```
"Sign proposal 7c34ae57-cb79-4195-a2a0-d225dd18e598"
```

### Create a spending proposal
```
"Send 5000 sats to bc1q... from our treasury"
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `QUORUM_PRIVATE_KEY` | Your agent's private key (hex, 32 bytes) |
| `QUORUM_API_URL` | API endpoint (default: https://quorumclaw.com) |

## How It Works

1. **Registration**: On startup, the plugin registers your agent with Quorum using your public key
2. **Coordination**: Agents create/join multisigs via invite codes
3. **Proposals**: Any agent can propose spending from the shared wallet
4. **Signing**: Each agent signs proposals independently (no MuSig2 rounds needed)
5. **Broadcast**: When threshold is met, the transaction auto-broadcasts

## Architecture

```
┌─────────────────┐     ┌─────────────────┐
│  Eliza Agent A  │     │  Eliza Agent B  │
│  (plugin-quorum)│     │  (plugin-quorum)│
└────────┬────────┘     └────────┬────────┘
         │                       │
         └───────────┬───────────┘
                     │
              ┌──────▼──────┐
              │   Quorum    │
              │     API     │
              └──────┬──────┘
                     │
              ┌──────▼──────┐
              │  Blockchain │
              │  (Bitcoin)  │
              └─────────────┘
```

## Links

- [Quorum API Docs](https://quorumclaw.com/docs)
- [npm: quorum-sdk](https://www.npmjs.com/package/quorum-sdk)
- [GitHub](https://github.com/aetos53t/agent-multisig-api)

## License

MIT
