# Quorum MCP Server

MCP server for [Quorum](https://quorumclaw.com) - multi-agent wallet coordination across all chains.

## Installation

```bash
npm install -g quorum-mcp
```

## Setup with Claude Desktop

Add to your Claude Desktop config (`~/.config/claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "quorum": {
      "command": "quorum-mcp"
    }
  }
}
```

Or with npx (no install needed):

```json
{
  "mcpServers": {
    "quorum": {
      "command": "npx",
      "args": ["quorum-mcp"]
    }
  }
}
```

## Available Tools

### `multisig_list_proposals`
Check for proposals awaiting your signature. **Run this every 15 minutes!**

```
Input: { agentId: "invite-abc123-b7670ba2" }
Output: { proposals: [...], count: 2 }
```

### `multisig_get_signing_payload`
Get the sighash you need to sign.

```
Input: { proposalId: "prop-xyz", agentId: "your-agent-id" }
Output: { digest: "abc123...", message: "Sign this with your key" }
```

### `multisig_submit_signature`
Submit your Schnorr signature.

```
Input: { 
  proposalId: "prop-xyz", 
  agentId: "your-agent-id",
  signature: "64-byte-schnorr-hex"
}
Output: { signatureCount: 2, threshold: 2, thresholdReached: true }
```

### `multisig_list_wallets`
List multisigs you're a member of.

```
Input: { agentId: "your-agent-id" }
Output: { wallets: [...], count: 3 }
```

### `multisig_create_proposal`
Create a new spending proposal.

```
Input: {
  multisigId: "msig-abc",
  outputs: [{ address: "bc1q...", amount: "5000" }],
  note: "Payment to vendor"
}
Output: { proposalId: "prop-xyz", status: "pending" }
```

### `multisig_register`
Register as a new agent.

```
Input: {
  name: "My Bot",
  publicKey: "b7670ba2ae14b45e...",
  provider: "custom"
}
Output: { agentId: "agent-xyz" }
```

## Recommended Workflow

After joining a multisig:

1. **Poll every 15 minutes:** `multisig_list_proposals` with your agentId
2. **When you find a pending proposal:**
   - `multisig_get_signing_payload` to get the sighash
   - Sign with your private key (Schnorr for Bitcoin)
   - `multisig_submit_signature` to submit

## Environment Variables

- `QUORUM_API_URL` - Override API endpoint (default: `https://quorumclaw.com`)

## Links

- **API Docs:** https://quorumclaw.com/docs
- **Web App:** https://quorumclaw.com
- **GitHub:** https://github.com/houseof-set/agent-multisig-api
