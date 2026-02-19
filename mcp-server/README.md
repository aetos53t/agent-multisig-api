# @scrapyard/multisig-mcp

MCP server for multi-agent wallet coordination. Connect your Claude agent to multisig wallets.

## Installation

```bash
npm install -g @scrapyard/multisig-mcp
```

## Configuration

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "multisig": {
      "command": "multisig-mcp",
      "env": {
        "MULTISIG_API_URL": "https://api.agentmultisig.dev"
      }
    }
  }
}
```

Or with npx:

```json
{
  "mcpServers": {
    "multisig": {
      "command": "npx",
      "args": ["@scrapyard/multisig-mcp"]
    }
  }
}
```

## Available Tools

### `multisig_register`
Register your agent with the coordination API.

```
Arguments:
  - name: Display name for your agent
  - publicKey: Your public key (hex)
  - provider: "aibtc" | "clawcash" | "bankr" | "custom"
  - webhookUrl: (optional) URL for signing notifications

Returns: { agentId: "..." }
```

### `multisig_status`
Check your registration and pending proposals.

```
Arguments:
  - agentId: Your agent ID

Returns: { agent: {...}, pendingProposals: 2 }
```

### `multisig_list_proposals`
List proposals awaiting your signature.

```
Arguments:
  - agentId: Your agent ID
  - status: "pending" | "signed" | "all"

Returns: { proposals: [...], count: 3 }
```

### `multisig_get_signing_payload`
Get the digest you need to sign.

```
Arguments:
  - proposalId: The proposal ID
  - agentId: Your agent ID

Returns: { digest: "abc123...", message: "Send 0.01 BTC to..." }
```

### `multisig_submit_signature`
Submit your signature.

```
Arguments:
  - proposalId: The proposal ID
  - agentId: Your agent ID
  - signature: Your signature (hex)

Returns: { signatureCount: 2, threshold: 2, thresholdReached: true }
```

### `multisig_list_wallets`
List multisig wallets you're a member of.

```
Arguments:
  - agentId: Your agent ID

Returns: { wallets: [...], count: 1 }
```

### `multisig_create_proposal`
Create a new spending proposal.

```
Arguments:
  - multisigId: The wallet ID
  - outputs: [{ address: "...", amount: "1000000" }]
  - note: (optional) Description

Returns: { proposalId: "...", status: "pending" }
```

## Example Workflow

1. **Register once:**
   ```
   multisig_register(name: "My Agent", publicKey: "abc123...", provider: "aibtc")
   → { agentId: "agent_xyz" }
   ```

2. **Check for pending proposals:**
   ```
   multisig_list_proposals(agentId: "agent_xyz")
   → { proposals: [{ id: "prop_123", ... }] }
   ```

3. **Get signing payload:**
   ```
   multisig_get_signing_payload(proposalId: "prop_123", agentId: "agent_xyz")
   → { digest: "def456..." }
   ```

4. **Sign with your wallet** (e.g., aibtc's `schnorr_sign_digest`)

5. **Submit signature:**
   ```
   multisig_submit_signature(proposalId: "prop_123", agentId: "agent_xyz", signature: "...")
   → { thresholdReached: true }
   ```

## Environment Variables

- `MULTISIG_API_URL` - API endpoint (default: https://api.agentmultisig.dev)
