# Feature Request: Raw Schnorr Digest Signing for Taproot Multisig

## Summary

Add a `schnorr_sign_digest` tool that signs a raw 32-byte digest using the wallet's Taproot private key and returns a 64-byte Schnorr signature. This enables coordination with multi-agent Taproot multisig wallets.

## Use Case

When multiple AI agents share a Taproot multisig wallet, each agent needs to sign a **sighash** (transaction digest) rather than a full message or transaction. The current signing tools don't support this:

- `btc_sign_message` - BIP-137 message signing (adds prefix, returns recoverable sig)
- `signBtcTransaction` - Signs a full transaction (requires building internally)

For **Taproot script-path spending** (OP_CHECKSIGADD multisig), we need:
1. Coordinator computes BIP341 sighash for each input
2. Each agent signs the raw sighash with Schnorr
3. Coordinator assembles witness with all signatures

## Proposed Tool

```typescript
// Tool: schnorr_sign_digest
{
  name: "schnorr_sign_digest",
  description: "Sign a 32-byte digest with Schnorr using the Taproot private key",
  input: {
    digest: z.string()
      .length(64)
      .describe("32-byte hex-encoded digest (e.g., BIP341 sighash)"),
    auxRand: z.string()
      .length(64)
      .optional()
      .describe("Optional 32-byte aux randomness for BIP340"),
  },
  output: {
    signature: string,      // 64-byte hex Schnorr signature
    publicKey: string,      // 32-byte x-only pubkey that signed
    address: string,        // Taproot address
  }
}
```

## Implementation

You already have everything needed:

```typescript
import { schnorr } from '@noble/curves/secp256k1';

// In signing.tools.ts
export async function schnorrSignDigest(digest: string, auxRand?: string) {
  const account = getWalletManager().getCurrentAccount();
  const { privateKey } = deriveTaprootKeyPair(account.mnemonic, NETWORK);
  
  const digestBytes = hex.decode(digest);
  const auxBytes = auxRand ? hex.decode(auxRand) : undefined;
  
  const signature = schnorr.sign(digestBytes, privateKey, auxBytes);
  const pubkey = schnorr.getPublicKey(privateKey);
  
  return {
    signature: hex.encode(signature),
    publicKey: hex.encode(pubkey),
    address: deriveTaprootAddress(account.mnemonic, NETWORK).address,
  };
}
```

## Why This Matters

This enables:
- Multi-agent Bitcoin treasuries
- DAO-style coordination where agents vote on transactions
- Threshold signing without trusted coordinators
- Interop with PSBT-based workflows

## Related

Building an Agent Multisig Coordination API that works with aibtc, AgentKit, Crossmint, etc. The aibtc adapter is blocked on this capability.

Happy to submit a PR if you point me to the right place!
