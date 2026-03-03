# Ordinal Support for Quorum

**Goal:** Enable agents to send ordinals/inscriptions from multisig wallets via PSBT coordination.

## Use Case

Agent holds a valuable ordinal in a 2-of-3 multisig. Buyer wants to purchase it. Agent creates a proposal to send the ordinal to buyer's address. Human co-signers approve. Ordinal transfers.

## How Ordinals Work

Ordinals are tracked by **satoshi position** - each sat has a unique ordinal number based on when it was mined. Inscriptions are attached to specific sats.

**Key rule:** First-sat-in-first-sat-out (FIFO). When constructing a transaction, sats flow from inputs to outputs in order. The inscription travels with its sat.

## Architecture

```
┌─────────────────┐     ┌──────────────┐     ┌─────────────┐
│  Ordinal Indexer │────▶│   Quorum API  │────▶│  Bitcoin    │
│  (Hiro/ord)      │     │  + Ordinal    │     │  Network    │
└─────────────────┘     │  Awareness    │     └─────────────┘
                        └──────────────┘
```

## Required Changes

### 1. Ordinal Indexer Integration

Add endpoint to lookup inscription location:

```typescript
// GET /ordinals/:inscriptionId
{
  inscriptionId: "abc123i0",
  satpoint: "txid:vout:offset",
  address: "bc1p...",
  contentType: "image/png",
  contentLength: 12345
}
```

**Indexer options:**
- **Hiro Ordinals API** (free, hosted): `https://api.hiro.so/ordinals/v1`
- **ord** (self-hosted): run `ord server`
- **OrdPool** / **Ordiscan** APIs

### 2. Ordinal-Aware UTXO Selection

When creating a proposal to send an ordinal:

```typescript
interface OrdinalSendRequest {
  multisigId: string;
  inscriptionId: string;      // The ordinal to send
  recipientAddress: string;   // Where to send it
  feeRate?: number;
}
```

Flow:
1. Query indexer for inscription's current satpoint
2. Find the UTXO containing that satpoint
3. Verify UTXO belongs to the multisig
4. Calculate sat position within UTXO

### 3. Safe PSBT Construction

**The tricky part:** Ensuring the ordinal ends up in the recipient output, not change.

```
INPUTS:                          OUTPUTS:
┌────────────────────┐          ┌────────────────────┐
│ UTXO with ordinal  │ ───────▶ │ Recipient (ordinal)│  ← ordinal goes here
│ (10,000 sats)      │          │ (546 sats min)     │
└────────────────────┘          ├────────────────────┤
┌────────────────────┐          │ Change output      │
│ Fee UTXO           │ ───────▶ │ (remaining sats)   │
│ (5,000 sats)       │          └────────────────────┘
└────────────────────┘

Sat flow (FIFO):
- Sats 0-545 from ordinal UTXO → Recipient output (includes inscription)
- Sats 546-9999 from ordinal UTXO → Change output
- Sats from fee UTXO → Change output (minus fee)
```

**Key insight:** Put the ordinal UTXO first in inputs, recipient first in outputs. The inscription (at offset 0 typically) flows to the first output.

### 4. New API Endpoints

```
POST /v1/proposals/ordinal
  - inscriptionId: string
  - recipientAddress: string
  - multisigId: string
  - feeRate?: number
  
GET /v1/multisigs/:id/ordinals
  - Lists all ordinals held by multisig
  
GET /v1/ordinals/:inscriptionId
  - Lookup inscription details
```

### 5. Safety Checks

Before creating ordinal send proposal:
- [ ] Verify inscription exists at expected satpoint
- [ ] Verify multisig owns the UTXO
- [ ] Ensure recipient is valid taproot/segwit address
- [ ] Calculate minimum output value (546 dust limit)
- [ ] Warn if inscription offset is non-zero (edge case)

## Implementation Steps

1. **Add Hiro API client** (~2 hours)
   - Lookup inscription by ID
   - Get satpoint (txid:vout:offset)
   
2. **Extend UTXO selection** (~2 hours)
   - Find UTXO containing specific satpoint
   - Calculate sat position
   
3. **Ordinal-safe PSBT builder** (~3 hours)
   - Input ordering (ordinal UTXO first)
   - Output ordering (recipient first)
   - Handle offset > 0 edge cases
   
4. **New endpoints** (~2 hours)
   - POST /proposals/ordinal
   - GET /multisigs/:id/ordinals
   
5. **Testing** (~2 hours)
   - Testnet inscription creation
   - Multisig → single address transfer
   - Verify inscription arrives correctly

**Total: ~1 day**

## Edge Cases

1. **Offset > 0**: Inscription not at first sat of UTXO. Need to send enough sats to "carry" the inscription to the right output.

2. **Multiple inscriptions in one UTXO**: Rare, but possible. Need to handle carefully.

3. **Cursed inscriptions**: Some inscriptions have negative numbers. Still work the same way.

4. **Parent-child inscriptions**: Provenance chain. No special handling needed for sends.

## Example Flow

```bash
# 1. Agent lists ordinals in their multisig
curl quorumclaw.com/v1/multisigs/abc123/ordinals
# Returns: [{inscriptionId: "xyz789i0", ...}]

# 2. Create proposal to send ordinal
curl -X POST quorumclaw.com/v1/proposals/ordinal \
  -d '{
    "multisigId": "abc123",
    "inscriptionId": "xyz789i0", 
    "recipientAddress": "bc1p...",
    "note": "Selling to buyer for 0.5 BTC (paid separately)"
  }'

# 3. Co-signers approve via normal signing flow
# 4. Broadcast, ordinal transfers
```

## Questions

1. **Payments:** Handle payment in same tx? Or separate? (Recommendation: separate - simpler, buyer sends BTC, then multisig releases ordinal)

2. **Marketplace integration:** Want to integrate with Magic Eden / Ordinals Wallet APIs for listings?

3. **Inscription creation:** Should multisig be able to inscribe new ordinals? (More complex - needs commit/reveal)

---

*Ready to implement on green light.*
