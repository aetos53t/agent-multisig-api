# Solana Multisig Research

## Squads Protocol

**Website:** https://squads.xyz (formerly squads.so)  
**GitHub:** https://github.com/Squads-Protocol  
**SDK:** `@sqds/multisig`

### Overview

Squads is the dominant multisig solution on Solana, securing billions in assets. They provide both a web interface and SDKs for programmatic access.

### Architecture

Squads uses **Program Derived Addresses (PDAs)** for multisig accounts:

```
┌─────────────────┐
│     Squad       │  (PDA - the multisig account)
├─────────────────┤
│ - members[]     │
│ - threshold     │
│ - transactionIdx│
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Transaction    │  (PDA - proposal/tx to execute)
├─────────────────┤
│ - instructions[]│
│ - approvals[]   │
│ - status        │
└─────────────────┘
```

### Key Concepts

1. **Squad** - The multisig account (PDA)
2. **Members** - Signers with voting power
3. **Threshold** - Required approvals (e.g., 2-of-3)
4. **Transaction** - Pending proposal with instructions
5. **Vault** - PDA holding assets controlled by the squad

### SDK Usage (Estimated)

```typescript
import * as multisig from "@sqds/multisig";

// Create squad
const [squadPda] = multisig.getSquadPda({
  createKey: createKeypair.publicKey,
});

// Create transaction proposal
const transactionIndex = await multisig.createTransaction({
  connection,
  squadPda,
  creator: memberKeypair,
  instructions: [...],
});

// Approve transaction
await multisig.approveTransaction({
  connection,
  squadPda,
  transactionIndex,
  member: memberKeypair,
});

// Execute when threshold reached
await multisig.executeTransaction({
  connection,
  squadPda,
  transactionIndex,
});
```

### Integration Path

For Agent Multisig:

1. **Adapter approach** - Wrap Squads SDK calls
2. **Key management** - Agents provide ed25519 keypairs (Solana native)
3. **Coordination flow**:
   - Create transaction → get proposal ID
   - Each agent calls `approveTransaction`
   - API tracks approvals, triggers `executeTransaction` at threshold

### Key Differences from Bitcoin/EVM

| Aspect | Bitcoin | EVM (Safe) | Solana (Squads) |
|--------|---------|------------|-----------------|
| Signature | Schnorr | ECDSA | ed25519 |
| On-chain tx | Aggregated | execTransaction() | executeTransaction() |
| State | UTXO | Contract storage | PDAs |
| Gas | Fees in BTC | Gas in ETH | Fees in SOL |

### Questions to Resolve

1. How do we handle transaction serialization for signing?
2. Does Squads support "offline" signing (sign digest vs full approval tx)?
3. What's the cost per approval transaction?
4. Can we use versioned transactions for efficiency?

### Implementation Notes

- Solana signatures are ed25519 (64 bytes)
- Different curve than Bitcoin/Ethereum (not secp256k1)
- May need separate key derivation path for Solana agents
- Squads charges fees for their service (need to check current pricing)

### References

- Squads v4 Docs: https://docs.squads.so/
- Squads GitHub: https://github.com/Squads-Protocol/v4
- @sqds/multisig: https://www.npmjs.com/package/@sqds/multisig
- Solana Web3.js: https://solana-labs.github.io/solana-web3.js/
