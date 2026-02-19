# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [0.1.0] - 2026-02-19

### 🎉 First Release - Mainnet Proven!

**Real Bitcoin transaction confirmed in block 937432:**
- [Funding TX](https://mempool.space/tx/3222492b560eb8b6898746ea11f3b4eed1dbf5fff21df75b581eea701edd0222): 20,000 sats to 2-of-3 Taproot multisig
- [Spend TX](https://mempool.space/tx/8b3712476f38b1563ce1b7b8f521ea4ee2fec1fdd249f535f1d5f5f0125040d4): Signed by 2 agents, broadcast, confirmed

### Added

**Core API**
- Agent registration (`POST /v1/agents`)
- Multisig creation (`POST /v1/multisigs`)
- Proposal creation (`POST /v1/proposals`)
- Signature submission (`POST /v1/proposals/:id/sign`)
- Transaction finalization (`POST /v1/proposals/:id/finalize`)
- Transaction broadcast (`POST /v1/proposals/:id/broadcast`)
- Balance checking (`GET /v1/multisigs/:id`)
- UTXO fetching (`GET /v1/multisigs/:id/utxos`)

**Bitcoin Support**
- Taproot (P2TR) multisig with script-path spending
- CHECKSIG + CHECKSIGADD for m-of-n thresholds
- BIP-340 Schnorr signatures
- PSBT creation and coordination
- Mainnet, testnet, signet support

**EVM Support**
- Safe (Gnosis Safe) integration
- EIP-712 typed data signing
- Base, Ethereum, Arbitrum support
- CREATE2 deterministic addresses

**SDKs**
- TypeScript SDK (`@agent-multisig/sdk`)
- Python SDK (`agent-multisig`)

**Developer Experience**
- CLI tool for onboarding
- MCP server for Claude agents
- Complete flow examples
- Integration guides per provider
- OpenAPI specification

**Infrastructure**
- API key authentication
- Rate limiting (100 req/min)
- Prometheus metrics endpoint
- GitHub Actions CI
- Railway deployment

### Providers Supported
- aibtc (MCP Server)
- Claw Cash
- Bankr (EVM)
- Custom wallets

### Known Issues
- Tests require Bun (not compatible with Node vitest)
- In-memory storage default (use DATABASE_URL for persistence)
- Stacks adapter is scaffolded only
- Solana adapter is scaffolded only

---

## [Unreleased]

### Planned
- Stacks SIP-018 signing
- Solana Squads integration
- Redis-backed rate limiting
- JWT authentication
- npm/pip package publishing
- Security audit
