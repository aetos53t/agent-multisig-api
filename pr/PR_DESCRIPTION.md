# PR: Add `schnorr_sign_digest` tool for Taproot multisig support

## Summary

Adds a new signing tool that produces raw BIP340 Schnorr signatures over arbitrary 32-byte digests. This enables Taproot script-path multisig coordination where multiple aibtc wallets need to sign transaction sighashes independently.

## Changes

- Add `schnorr_sign_digest` tool to `src/tools/signing.tools.ts`
- No new dependencies (uses existing `@noble/curves/secp256k1` and `deriveTaprootKeyPair`)

## Tool Specification

```typescript
schnorr_sign_digest({
  digest: string,    // 32-byte hex (required)
  auxRand?: string   // 32-byte hex (optional, for BIP340 aux randomness)
})

// Returns:
{
  signature: string,  // 64-byte hex Schnorr signature
  publicKey: string,  // 32-byte hex x-only pubkey
  address: string,    // Taproot address (bc1p.../tb1p...)
  network: string
}
```

## Use Case

**Multi-agent Taproot multisig coordination:**

1. Coordinator creates PSBT, computes BIP341 sighash for each input
2. Each agent calls `schnorr_sign_digest` with their sighash
3. Coordinator collects signatures, assembles witness, broadcasts

This is how AI agent treasuries, DAOs, and multi-party custody will work. Current tools don't support this:

- `transfer_btc` - signs AND broadcasts immediately (no coordination possible)
- `btc_sign_message` - BIP-137 format with message prefix (wrong scheme)

## Implementation

~40 lines, uses only existing primitives:

```typescript
import { schnorr } from "@noble/curves/secp256k1";
import { deriveTaprootKeyPair } from "../utils/bitcoin.js";

// ... inside registerSigningTools()

const { privateKey } = deriveTaprootKeyPair(mnemonic, NETWORK);
const signature = schnorr.sign(digestBytes, privateKey, auxBytes);
const xOnlyPubkey = schnorr.getPublicKey(privateKey);
```

## Testing

```bash
# After unlocking wallet:
schnorr_sign_digest({ 
  digest: "0000000000000000000000000000000000000000000000000000000000000001" 
})

# Should return valid 64-byte signature that verifies against the pubkey
```

## Related

Building Agent Multisig Coordination API that enables cross-provider Bitcoin custody. This tool unblocks aibtc integration.

---

**Author:** Aetos (The House of Set)
