# Solana (Squads Protocol) Integration

> **Status: 🔜 Coming Soon**

[Squads Protocol](https://squads.so) is the leading multisig solution on Solana, securing over $10B in assets.

## Overview

Squads Protocol v4 provides:
- **Multisig consensus** - m-of-n threshold signing
- **Time locks** - Delay execution of transactions
- **Spending limits** - Cap how much can be spent
- **Roles** - Different permission levels
- **Sub-accounts** - Organize funds

## How It Will Work

### Architecture

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Agent 1   │    │   Agent 2   │    │   Agent 3   │
│  (Ed25519)  │    │  (Ed25519)  │    │  (Ed25519)  │
└──────┬──────┘    └──────┬──────┘    └──────┬──────┘
       │                  │                  │
       └─────────────┬────┴────┬─────────────┘
                     │         │
                     ▼         ▼
            ┌──────────────────────────┐
            │    COORDINATION API      │
            │  (proposals, signatures) │
            └────────────┬─────────────┘
                         │
                         ▼
            ┌──────────────────────────┐
            │    Squads Program        │
            │  SQDS4ep65T869zMMBKyu... │
            └──────────────────────────┘
```

### Signing Flow

1. **Create Vault** → Call Squads program to create multisig
2. **Create Proposal** → Build Solana transaction
3. **Sign** → Each agent signs with Ed25519 (64 bytes)
4. **Execute** → Submit approved transaction

## Key Differences from Bitcoin/EVM

| Aspect | Bitcoin | EVM | Solana |
|--------|---------|-----|--------|
| Signature | Schnorr | ECDSA | Ed25519 |
| Multisig | Taproot script | Safe contract | Squads program |
| Address | P2TR | Contract addr | PDA |
| Coordination | PSBT | EIP-712 | Serialized tx |

## SDK

Squads provides TypeScript and Rust SDKs:

```typescript
import * as multisig from '@sqds/multisig';

// Create multisig
const multisigPda = multisig.getMultisigPda({
  createKey: createKey.publicKey,
});

// Create transaction proposal
const transactionIndex = await multisig.proposalCreate(...);

// Approve (sign)
await multisig.proposalApprove(...);

// Execute
await multisig.vaultTransactionExecute(...);
```

## Resources

- [Squads Protocol v4 GitHub](https://github.com/Squads-Protocol/v4)
- [Squads Documentation](https://docs.squads.so)
- [@sqds/multisig SDK](https://www.npmjs.com/package/@sqds/multisig)
- Program Address: `SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf`

## Timeline

Implementation planned after core Bitcoin and EVM support is stable.

Key work items:
1. Ed25519 signature support in adapters
2. Squads SDK integration
3. Transaction serialization for signing
4. PDA address derivation
