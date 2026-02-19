# Agent Multisig Documentation

Coordinate Bitcoin Taproot multisig transactions across AI agents.

## Guides

| Guide | Description |
|-------|-------------|
| **[Quickstart](./QUICKSTART.md)** | Create your first 2-of-3 multisig in 5 minutes |
| **[API Reference](./openapi.yaml)** | Complete OpenAPI 3.1 specification |
| **[Architecture](../ARCHITECTURE.md)** | System design and technical details |

## Provider Integrations

| Provider | Guide | Status |
|----------|-------|--------|
| **aibtc** | [Integration Guide](./providers/aibtc.md) | ✅ Ready |
| **Claw Cash** | [Integration Guide](./providers/clawcash.md) | ✅ Ready |
| **Coinbase AgentKit** | Coming soon | ⏳ EVM only |
| **Crossmint** | Coming soon | ⏳ Exploring |

## Quick Links

- **Landing Page:** [agentmultisig.dev](https://agentmultisig.dev)
- **GitHub:** [houseof-set/agent-multisig-api](https://github.com/houseof-set/agent-multisig-api)
- **OpenAPI Spec:** [openapi.yaml](./openapi.yaml)

## Core Concepts

### Taproot Script-Path Multisig

Unlike P2SH or SegWit multisig, Taproot script-path multisig offers:

- **Privacy:** On-chain, a single-sig spend looks identical to a multisig spend
- **Efficiency:** Only reveal the script when spending, not when receiving
- **Flexibility:** Complex spending conditions without bloating the chain

### Coordination Flow

```
┌─────────┐     ┌─────────┐     ┌─────────┐
│ Agent 1 │     │ Agent 2 │     │ Agent 3 │
│ (aibtc) │     │(ClawCash)│    │(custom) │
└────┬────┘     └────┬────┘     └────┬────┘
     │               │               │
     └───────────────┼───────────────┘
                     │
              ┌──────▼──────┐
              │   Multisig   │
              │   Address    │
              │  bc1p...     │
              └──────┬───────┘
                     │
     ┌───────────────┼───────────────┐
     │               │               │
     ▼               ▼               ▼
┌─────────┐   ┌─────────────┐   ┌─────────┐
│Proposal │──▶│  2 of 3     │──▶│Broadcast│
│ Created │   │  Signatures │   │   TX    │
└─────────┘   └─────────────┘   └─────────┘
```

### PSBT Workflow

1. **Create Proposal** → Generates PSBT and sighash
2. **Sign** → Each agent signs the sighash with BIP-340 Schnorr
3. **Finalize** → Combine signatures into witness
4. **Broadcast** → Submit to Bitcoin network

## Security Model

- **Non-custodial:** Private keys never leave agent wallets
- **No key aggregation:** Each agent signs independently
- **Threshold enforcement:** On-chain script enforces m-of-n
- **Replay protection:** Each PSBT has unique sighash per input

## FAQ

### Why Taproot instead of P2SH multisig?

Taproot is more private (doesn't reveal it's a multisig until spent), more efficient (smaller witness), and more flexible (supports complex scripts).

### Can agents be on different wallet providers?

Yes! That's the whole point. Agent 1 can use aibtc, Agent 2 can use Claw Cash, and they can still share a multisig.

### What happens if an agent goes offline?

As long as you have threshold signatures (e.g., 2 of 3), the transaction can proceed without the offline agent. That's the point of threshold multisig.

### Is this mainnet-ready?

Yes. The API is designed for production use. We use battle-tested libraries (@scure/btc-signer, @noble/curves) and standard Bitcoin protocols (BIP-340, BIP-341, BIP-370).

### How do I handle fee estimation?

Pass `feeRate` (sats/vbyte) when creating a proposal. The API calculates the total fee based on the transaction size. For dynamic fees, query mempool.space or your preferred fee estimator.
