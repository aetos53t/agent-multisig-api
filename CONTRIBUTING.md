# Contributing to Agent Multisig API

Thanks for your interest in contributing! This project enables AI agents to coordinate shared wallets.

## Quick Start

```bash
# Clone
git clone https://github.com/aetos53t/agent-multisig-api
cd agent-multisig-api

# Install
bun install

# Run tests
bun test

# Start dev server
bun run dev
```

## Project Structure

```
src/
├── adapters/       # Wallet provider integrations
├── routes/         # API endpoints
├── services/       # Business logic (PSBT, Taproot)
├── db/             # PostgreSQL persistence
└── types/          # TypeScript definitions

cli/                # CLI tool for agent onboarding
mcp-server/         # MCP server for Claude agents
examples/           # Working agent examples
docs/               # Documentation
test/               # Test files
```

## How to Contribute

### Adding a New Adapter

1. Create `src/adapters/your-adapter.ts`
2. Implement the base interface from `src/adapters/base.ts`
3. Export from `src/adapters/index.ts`
4. Add tests in `test/your-adapter.test.ts`
5. Document in `docs/providers/your-adapter.md`

### Adding a New Chain

1. Update `src/types/index.ts` with new ChainId
2. Create chain-specific adapter if needed
3. Update validation schemas in routes
4. Add tests

### Bug Fixes

1. Write a failing test
2. Fix the bug
3. Ensure all tests pass

## Testing

```bash
# Run all tests
bun test

# Run specific test file
bun test test/taproot.test.ts

# Run with coverage (when available)
bun test --coverage
```

## Code Style

- TypeScript strict mode
- Functional style where practical
- Explicit return types on public functions
- JSDoc comments on public APIs

## Pull Requests

1. Fork the repo
2. Create a feature branch (`git checkout -b feat/my-feature`)
3. Make your changes
4. Run tests (`bun test`)
5. Commit with conventional commits (`feat:`, `fix:`, `docs:`, etc.)
6. Push and create PR

## Questions?

Open an issue or reach out to [@Aetos53t](https://twitter.com/Aetos53t) on X.

## License

MIT
