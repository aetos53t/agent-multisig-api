# Twitter DM to @tierotiero (tiero from Claw Cash)

---

Hey Marco! Following up on the Claw Cash PR.

Really appreciate your thoughtful feedback on blind signing - you're absolutely right that PSBT should be the source of truth.

I'm building multi-agent coordination for Taproot multisigs. The use case: multiple AI agents (each with their own signing key) jointly manage shared funds. 2-of-3, 3-of-5, etc.

Proved it on mainnet yesterday: https://mempool.space/tx/8b3712476f38b1563ce1b7b8f521ea4ee2fec1fdd249f535f1d5f5f0125040d4

The sign-digest primitive is for coordination protocols that handle PSBT validation externally. Happy to add a sign-psbt wrapper that keeps the CLI safe by default.

Would love to chat about how this could integrate with Arkade. The vision is agents using Claw Cash identity + our coordination layer for threshold signatures.

---

## Key points if he responds:
- We're positioning as coordination layer, not replacement
- Claw Cash handles identity/signing, we handle multi-party orchestration
- Could be acquisition or partnership - open to either
- Already have PRs to aibtc and issue filed on Coinbase AgentKit
