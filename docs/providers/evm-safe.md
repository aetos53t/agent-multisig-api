# EVM (Safe) Integration

The Agent Multisig API uses [Safe](https://safe.global) (formerly Gnosis Safe) for EVM chain multisig support.

## Supported Chains

- Ethereum Mainnet (`ethereum`)
- Base (`base`)
- Arbitrum (`arbitrum`)

## How It Works

Unlike Bitcoin (which uses native Taproot multisig), EVM chains require a smart contract for multisig functionality. Safe is the industry standard.

### Architecture

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────┐
│   Agent 1   │────▶│   Coordination   │◀────│   Agent 2   │
│  (signs)    │     │       API        │     │  (signs)    │
└─────────────┘     └────────┬─────────┘     └─────────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │  Safe Contract  │
                    │  (holds funds)  │
                    └─────────────────┘
```

### Flow

1. **Create Vault** → We deploy a Safe contract with agent addresses as owners
2. **Create Proposal** → Generate `safeTxHash` and EIP-712 typed data
3. **Sign** → Agents sign the typed data with their wallets
4. **Execute** → Once threshold met, call `execTransaction()` on Safe

## Creating a Vault

```bash
POST /multisigs
{
  "name": "Treasury",
  "chainId": "ethereum",
  "agents": ["agent-1", "agent-2", "agent-3"],
  "threshold": 2
}
```

Response:
```json
{
  "id": "msig_abc123",
  "address": "0x1234...",
  "chainId": "ethereum",
  "threshold": 2,
  "evm": {
    "contractAddress": "0x1234...",
    "implementationType": "gnosis-safe"
  }
}
```

## Signing a Proposal

When your agent receives a webhook for a new proposal, the payload includes EIP-712 typed data:

```json
{
  "event": "proposal.created",
  "data": {
    "proposalId": "prop_xyz",
    "digest": "0xabc123...",
    "raw": {
      "evm": {
        "domain": {
          "name": "Safe",
          "version": "1.3.0",
          "chainId": 1,
          "verifyingContract": "0x1234..."
        },
        "types": { ... },
        "value": { ... }
      }
    }
  }
}
```

### Signing with viem

```typescript
import { signTypedData } from 'viem/accounts';

const signature = await signTypedData({
  privateKey: AGENT_PRIVATE_KEY,
  domain: payload.raw.evm.domain,
  types: payload.raw.evm.types,
  primaryType: 'SafeTx',
  message: payload.raw.evm.value,
});

// Submit to coordination API
await fetch(`/proposals/${proposalId}/signatures`, {
  method: 'POST',
  body: JSON.stringify({
    agentId: MY_AGENT_ID,
    signature,
  }),
});
```

### Signing with ethers.js

```typescript
const signature = await wallet._signTypedData(
  payload.raw.evm.domain,
  { SafeTx: payload.raw.evm.types.SafeTx },
  payload.raw.evm.value
);
```

## Gas Considerations

Unlike Bitcoin where fees come from the transaction itself, EVM requires:

1. **Deployment gas**: ~$50-100 to deploy the Safe (one-time per vault)
2. **Execution gas**: Paid by whoever calls `execTransaction()`

The API can optionally use a relayer to sponsor gas.

## Safe Transaction Service

For production, we integrate with Safe's Transaction Service API for:

- Off-chain signature collection
- Transaction history
- Safe metadata

## Differences from Bitcoin

| Aspect | Bitcoin (Taproot) | EVM (Safe) |
|--------|-------------------|------------|
| Multisig type | Native script | Smart contract |
| Deployment | None needed | Contract deploy |
| Signatures | Schnorr (64 bytes) | ECDSA (65 bytes) |
| Signing format | PSBT sighash | EIP-712 typed data |
| Execution | Broadcast signed tx | Call contract method |
| Fees | From tx inputs | Separate gas payment |

## Security Notes

- Safe contracts are battle-tested ($100B+ secured)
- Each vault is an independent contract
- We never hold private keys - just coordinate
- Signatures are verified on-chain by the Safe contract
