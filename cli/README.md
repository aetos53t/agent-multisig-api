# @agent-multisig/cli

One-command agent onboarding for multi-agent wallets.

## Quick Start

```bash
# Install globally
npm install -g @agent-multisig/cli

# Register your agent
agent-multisig init
```

That's it. You're registered.

## Commands

### `agent-multisig init`

Interactive setup. Walks you through:
1. Selecting your wallet provider (aibtc, clawcash, bankr, custom)
2. Entering your public key
3. Naming your agent
4. (Optional) Configuring webhook for signing notifications

```bash
# Interactive mode
agent-multisig init

# Or with flags
agent-multisig init \
  --provider aibtc \
  --name "My Treasury Agent" \
  --public-key "abc123..." \
  --webhook "https://myagent.com/webhook"
```

### `agent-multisig status`

Health check. Verifies:
- Local config exists
- API is reachable
- Agent registration is valid
- Any pending proposals

```bash
agent-multisig status
```

### `agent-multisig list`

List proposals awaiting your signature.

```bash
# Pending proposals only (default)
agent-multisig list

# All proposals including completed
agent-multisig list --all
```

### `agent-multisig sign <proposalId>`

Sign a proposal. Shows transaction details, asks for confirmation, guides you through signing with your provider.

```bash
agent-multisig sign prop_abc123
```

### `agent-multisig whoami`

Show your agent info.

```bash
agent-multisig whoami
```

## Provider-Specific Setup

### aibtc (MCP Server)

1. Get your Taproot public key:
   ```
   wallet_get_info → taprootPublicKey
   ```

2. Register:
   ```bash
   agent-multisig init --provider aibtc --public-key <your-x-only-pubkey>
   ```

3. When signing, use:
   ```
   schnorr_sign_digest({ digest: "<the-digest>" })
   ```

### Claw Cash

1. Get your public key:
   ```bash
   cash pubkey
   ```

2. Register:
   ```bash
   agent-multisig init --provider clawcash --public-key <your-pubkey>
   ```

3. When signing:
   ```bash
   cash sign-digest <digest>
   ```

### Bankr (EVM)

1. Find your agent address in Bankr dashboard

2. Register:
   ```bash
   agent-multisig init --provider bankr --public-key <your-evm-address>
   ```

3. When signing, call Bankr API:
   ```bash
   POST https://api.bankr.bot/agent/sign
   { "signatureType": "eth_signTypedData_v4", "typedData": {...} }
   ```

## Config

Config stored at `~/.agent-multisig/config.json`

```json
{
  "agentId": "agent_abc123",
  "name": "My Agent",
  "provider": "aibtc",
  "publicKey": "abc123...",
  "apiUrl": "https://api.agentmultisig.dev",
  "testnet": false
}
```

## Testnet Mode

For testing without real funds:

```bash
agent-multisig init --testnet
```

Uses Bitcoin signet / EVM testnets.
