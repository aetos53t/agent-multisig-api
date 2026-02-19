# Stacks Multisig Research

## SIP-018: Signed Structured Data

**Status:** Ratified standard  
**Author:** Marvin Janssen  
**Spec:** https://github.com/stacksgov/sips/blob/main/sips/sip-018/sip-018-signed-structured-data.md

### Overview

SIP-018 is the Stacks equivalent of EIP-712 (Ethereum typed structured data). It provides a standardized way to sign messages that aren't transactions, making them verifiable by smart contracts.

### How It Works

```
messageHash = SHA256("SIP018" || domainHash || structuredDataHash)
signature = sign(messageHash, privateKey)  // secp256k1 ECDSA, RSV order
```

**domainHash:**
```clarity
{
  name: (string-ascii len),      ; App name
  version: (string-ascii len),   ; App version
  chain-id: uint                 ; Chain ID (mainnet = 1)
}
```

**structuredDataHash:**
```
SHA256(ToCVWireFormat(clarityValue))
```
Where `ToCVWireFormat` is the SIP-005 wire format encoding for Clarity values.

### Use Cases

1. **Meta transactions** - User signs message, relayer submits tx
2. **Off-chain coordination** - Sign proposals, settle on-chain
3. **Proof of ownership** - Prove control of address

### Integration Path

For Agent Multisig, we can use SIP-018 to:

1. **Encode proposal data** as Clarity tuple:
   ```clarity
   {
     multisig-id: (string-ascii 64),
     proposal-id: (string-ascii 64),
     action: (string-ascii 32),
     outputs: (list 10 { recipient: principal, amount: uint }),
     nonce: uint
   }
   ```

2. **Domain binding** for our coordination API:
   ```clarity
   {
     name: "agent-multisig",
     version: "1",
     chain-id: u1  ; mainnet
   }
   ```

3. **On-chain verification** using `secp256k1-verify` in Clarity

### Implementation Notes

- Stacks uses secp256k1 (same curve as Bitcoin)
- Signatures are 65 bytes (RSV format)
- Can verify in smart contracts with `secp256k1-verify` or `secp256k1-recover`
- Domain binding prevents replay attacks across apps/chains

### Libraries

- `@stacks/transactions` - Has SIP-018 signing support
- `micro-stacks` - Lighter alternative
- Clarity: `secp256k1-verify` built-in

### Questions to Resolve

1. Is there an existing Stacks multisig standard/contract we should use?
2. How does Stacks handle native multisig (vs smart contract multisig)?
3. Transaction sponsorship for agents without STX?

### References

- SIP-018 Spec: https://github.com/stacksgov/sips/blob/main/sips/sip-018/
- SIP-005 Wire Format: https://github.com/stacksgov/sips/blob/main/sips/sip-005/
- @stacks/transactions: https://github.com/hirosystems/stacks.js
