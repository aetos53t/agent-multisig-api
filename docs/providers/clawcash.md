# Claw Cash Integration Guide

Use Claw Cash (OpenClaw native wallets) with Agent Multisig.

## Prerequisites

- Claw Cash CLI installed (`npm install -g clw-cash`)
- Wallet initialized and authenticated (`cash init`, `cash login`)

## Get Your Public Key

Claw Cash stores your public key in the config:

```bash
# View your config
cash config

# Or extract just the public key
cat ~/.clw-cash/config.json | jq -r '.publicKey'
```

The public key is in compressed format (33 bytes). For Taproot multisig, we use x-only format (32 bytes) - the API handles this conversion.

## Register as Agent

```bash
curl -X POST https://api.agentmultisig.dev/v1/agents \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Claw Cash Agent",
    "provider": "clawcash",
    "publicKey": "<your-public-key>"
  }'
```

## Signing Proposals

When a proposal needs your signature:

### 1. Get the signing payload

```bash
curl https://api.agentmultisig.dev/v1/proposals/prop_123/payload/agent_abc123

# Response:
# {
#   "digest": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
#   "message": "Sign to approve spending...",
#   "inputIndex": 0
# }
```

### 2. Sign with the CLI

```bash
cash sign-digest e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855

# Output:
# {
#   "digest": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
#   "signature": "e907831f80848d1069a5371b402410364bdf1c5f8307b0084c55f1ce2dca821525f66a4a85ea8b71e482a74f382d2ce5ebeee8fdb2172f477df4900d310536c0",
#   "publicKey": "02abc123...",
#   "signatureFormat": "BIP-340 Schnorr (64 bytes)"
# }
```

### 3. Submit signature

```bash
curl -X POST https://api.agentmultisig.dev/v1/proposals/prop_123/sign \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "agent_abc123",
    "signature": "e907831f80848d1069a5371b402410364bdf1c5f8307b0084c55f1ce2dca821525f66a4a85ea8b71e482a74f382d2ce5ebeee8fdb2172f477df4900d310536c0"
  }'
```

## Daemon Mode

If running the Claw Cash daemon (`cash start`), you can sign via HTTP:

```bash
curl -X POST http://127.0.0.1:2884/sign-digest \
  -H "Content-Type: application/json" \
  -d '{"digest": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"}'
```

## Programmatic Usage (TypeScript)

```typescript
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function signWithClawCash(digest: string): Promise<string> {
  const { stdout } = await execAsync(`cash sign-digest ${digest}`);
  const result = JSON.parse(stdout);
  return result.signature;
}

// Usage
const signature = await signWithClawCash(
  "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
);
```

## SDK Usage

If using the Claw Cash SDK directly:

```typescript
import { ClwApiClient } from '@clw-cash/sdk';

const client = new ClwApiClient(
  config.apiBaseUrl,
  config.identityId,
  config.sessionToken
);

// Sign a digest directly via the enclave
const signature = await client.signDigest(digest);
```

## Security Notes

- Private keys never leave the Evervault Enclave
- All signing is ticket-based (sign-intent → sign flow)
- Signatures are BIP-340 Schnorr compatible
- For Taproot multisig, ensure you're using the correct sighash type

## Troubleshooting

### "Wallet not configured"
Run `cash init` and `cash login` to set up your wallet.

### "Session expired"
Run `cash login` to refresh your authentication token.

### "Invalid digest format"
Ensure the digest is exactly 64 hex characters (32 bytes). Strip any "0x" prefix.
