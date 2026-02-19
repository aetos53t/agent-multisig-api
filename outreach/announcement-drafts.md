# Announcement Drafts

## Twitter Thread

**Tweet 1 (Hook):**
AI agents need wallets. But one agent = single point of failure.

We built a coordination API for multi-agent wallets.

2-of-3 AI treasuries. Cross-chain. Works with aibtc, Claw Cash, Bankr, and more.

🧵👇

---

**Tweet 2 (Problem):**
The problem:
- Agent A has a wallet key
- Agent A gets compromised
- All funds gone

The solution:
- Agents A, B, C each hold a key
- Need 2-of-3 to spend
- No single point of failure

---

**Tweet 3 (How it works):**
How it works:

1. Agents register their public keys
2. API generates a multisig address (Taproot on BTC, Safe on EVM)
3. Create spending proposals
4. Each agent signs independently
5. When threshold met → broadcast

No private keys ever leave the agent.

---

**Tweet 4 (Chains):**
Supported chains:

🟠 Bitcoin - Native Taproot P2TR
🔷 Ethereum - Gnosis Safe
🔵 Base - Gnosis Safe  
🟣 Arbitrum - Gnosis Safe
⬜ Stacks - Coming soon (SIP-018)
🟢 Solana - Coming soon (Squads)

Universal coordination, chain-specific execution.

---

**Tweet 5 (For developers):**
For agent developers:

```
npm install @scrapyard/multisig-cli
agent-multisig init
```

One command to register. 
MCP server for Claude agents.
Full API at /v1/

Docs: [link]
GitHub: [link]

---

**Tweet 6 (Live demo):**
Live API: https://agent-multisig-api-production.up.railway.app

Created a real 2-of-2 testnet multisig in the E2E test:
`tb1pycp7gwwpkwtnmvctnyqd7evj08wp82lh7v0xl9j50s9utxfrt62sln29w6`

72 tests passing. Ready for builders.

---

**Tweet 7 (Call to action):**
What you can build:

• AI DAO treasuries
• Agent escrow services
• Autonomous trading pools
• Multi-party custody
• Cross-agent coordination

Open source. MIT licensed.

Star it: github.com/aetos53t/agent-multisig-api

---

## Short Version (Single Tweet)

Shipped: Agent Multisig Coordination API

Multi-agent wallets for AI. 2-of-3 treasuries. Bitcoin + EVM.

• One-command onboarding
• MCP server for Claude
• 72 tests passing
• Live on Railway

github.com/aetos53t/agent-multisig-api

🤖🔐

---

## Discord/Community Post

**Title:** Agent Multisig API - Multi-agent wallets for AI

**Body:**
Hey everyone! Just shipped something we've been building: a coordination layer for multi-agent wallets.

**The problem:** AI agents need wallets, but a single-key wallet is a security risk. If one agent gets compromised, funds are gone.

**The solution:** Multi-signature wallets where 2-of-3 (or any M-of-N) agents must sign to spend. Coordination API handles the complexity.

**Features:**
- Bitcoin Taproot (P2TR) multisig
- EVM Safe (Gnosis) multisig
- Works with aibtc, Claw Cash, Bankr, custom signers
- One-command CLI onboarding
- MCP server for Claude agents
- 72 tests passing

**Links:**
- Live API: https://agent-multisig-api-production.up.railway.app
- GitHub: https://github.com/aetos53t/agent-multisig-api
- Docs: Coming soon

Looking for feedback from anyone building with AI agents. What features would be most useful?

---

## HackerNews Post

**Title:** Show HN: Agent Multisig API – Multi-agent wallets for AI

**Body:**
I built a coordination API for multi-agent cryptocurrency wallets.

Problem: AI agents increasingly need to hold/spend funds. Single-key wallets are a security risk.

Solution: Multi-signature wallets where M-of-N agents must approve transactions. API coordinates the signing without ever seeing private keys.

Technical details:
- Bitcoin: Native Taproot (P2TR) with script tree for all signer combinations
- EVM: Gnosis Safe smart contract multisig
- Signing: Agents sign digests (BIP-340 Schnorr or EIP-712), API assembles

Built with Bun + Hono. 72 tests passing. Live on Railway.

GitHub: https://github.com/aetos53t/agent-multisig-api

Would love feedback on the architecture and API design.
