# PSBT Coordination API for P2TR Script-Path Multisig

**Version:** 0.1.0  
**Author:** Lux / Aetos  
**Date:** 2026-02-18  

---

## Table of Contents

1. [Overview](#overview)
2. [Taproot Script-Path Fundamentals](#taproot-script-path-fundamentals)
3. [Data Structures](#data-structures)
4. [API Specification](#api-specification)
5. [Signing Flow](#signing-flow)
6. [Security Considerations](#security-considerations)
7. [Example Walkthrough](#example-walkthrough)
8. [Appendix: Tapscript Construction](#appendix-tapscript-construction)

---

## Overview

### Purpose

A coordination layer enabling multiple AI agents to collaboratively sign Bitcoin transactions using P2TR (Pay-to-Taproot) script-path spending. Each agent holds their own private key (via their wallet provider), and the API orchestrates the PSBT lifecycle from proposal to broadcast.

### Design Principles

1. **Agent-Agnostic** - Works with any wallet provider (aibtc, AgentKit, Crossmint, custom)
2. **Async-First** - Agents sign independently; no requirement for simultaneous availability
3. **Bitcoin-Native** - Pure PSBT flow, no smart contracts required
4. **Minimal Trust** - Coordination layer never holds keys; only assembles signatures

### Scope

This spec covers m-of-n multisig using Taproot script-path spending with `OP_CHECKSIGADD` construction. MuSig2 key-path spending (n-of-n) is out of scope for v1.

---

## Taproot Script-Path Fundamentals

### Taproot Address Structure

A P2TR address commits to two spending paths:

```
P2TR Output = SegWit v1 + 32-byte tweaked_pubkey

tweaked_pubkey = internal_pubkey + hash(internal_pubkey || merkle_root) * G
```

- **Key-path**: Spend with signature for `tweaked_pubkey` (requires all parties for MuSig2)
- **Script-path**: Reveal a script from the Merkle tree + provide witness satisfying it

For m-of-n agent coordination, we use **script-path only**.

### Script-Path Spending

To spend via script-path, the witness stack contains:

```
<witness elements to satisfy script>
<script>
<control_block>
```

Where `control_block` = `leaf_version | parity_bit | internal_pubkey | merkle_path`

### Tapscript for m-of-n

Using `OP_CHECKSIGADD` (BIP 342):

```
<pubkey_1> OP_CHECKSIG
<pubkey_2> OP_CHECKSIGADD
<pubkey_3> OP_CHECKSIGADD
...
<pubkey_n> OP_CHECKSIGADD
<m> OP_NUMEQUAL
```

Each pubkey checks its corresponding signature. `OP_CHECKSIGADD` accumulates valid signatures. Final check requires exactly `m` valid signatures.

**Witness for spending:**
```
<sig_n or empty>
<sig_n-1 or empty>
...
<sig_1 or empty>
```

Signatures must be in reverse order of pubkeys in script. Empty bytes for non-signing positions.

---

## Data Structures

### Agent

```typescript
interface Agent {
  id: string;                    // Unique identifier (e.g., "agent-alpha")
  name: string;                  // Human-readable name
  xOnlyPubkey: string;           // 32-byte x-only pubkey (hex, no 02/03 prefix)
  provider: WalletProvider;      // How this agent signs
  endpoint?: string;             // Optional callback URL for notifications
}

type WalletProvider = 
  | 'aibtc'
  | 'agentkit' 
  | 'crossmint'
  | 'custom';
```

### Multisig

```typescript
interface Multisig {
  id: string;                    // UUID
  name: string;                  // Human-readable name
  network: 'mainnet' | 'testnet' | 'signet';
  
  // Taproot construction
  internalPubkey: string;        // 32-byte x-only pubkey (usually unspendable)
  scriptTree: TapTree;           // Merkle tree of spending conditions
  merkleRoot: string;            // 32-byte root hash
  tweakedPubkey: string;         // Final output key
  address: string;               // bc1p... or tb1p...
  
  // Multisig config
  agents: Agent[];               // Participating agents (ordered)
  threshold: number;             // m in m-of-n
  
  // Metadata
  createdAt: Date;
  createdBy: string;             // Agent ID
}

interface TapTree {
  leaves: TapLeaf[];
  root: string;                  // Merkle root
}

interface TapLeaf {
  index: number;                 // Position in tree
  script: string;                // Hex-encoded Tapscript
  scriptHash: string;            // Tagged hash of script
  leafVersion: number;           // 0xc0 for BIP 342
  controlBlock: string;          // Pre-computed for this leaf
  signerPubkeys: string[];       // Pubkeys required (ordered as in script)
  signerAgentIds: string[];      // Corresponding agent IDs
}
```

### Proposal

```typescript
interface Proposal {
  id: string;                    // UUID
  multisigId: string;               // Which multisig
  status: ProposalStatus;
  
  // Transaction details
  outputs: TxOutput[];           // Where to send funds
  feeRate: number;               // sat/vB
  fee?: number;                  // Calculated fee in sats
  
  // UTXO selection
  inputs: TxInput[];             // UTXOs to spend
  changeOutput?: TxOutput;       // Change back to multisig
  
  // Signing coordination
  selectedLeafIndex: number;     // Which Tapscript leaf to use
  requiredSigners: string[];     // Agent IDs who must sign
  
  // PSBT data
  unsignedPsbt: string;          // Base64-encoded PSBT
  signedPsbt?: string;           // Updated as signatures added
  
  // Signature collection
  signatures: SignatureEntry[];
  
  // Final transaction
  finalTx?: string;              // Hex-encoded final transaction
  txid?: string;                 // After broadcast
  
  // Metadata
  createdAt: Date;
  createdBy: string;             // Agent ID who proposed
  expiresAt: Date;               // Auto-reject after this
  note?: string;                 // Human-readable description
}

type ProposalStatus = 
  | 'pending'                    // Awaiting signatures
  | 'ready'                      // Threshold reached, can finalize
  | 'finalized'                  // PSBT complete, ready to broadcast
  | 'broadcast'                  // Submitted to network
  | 'confirmed'                  // In a block
  | 'rejected'                   // Explicitly rejected
  | 'expired';                   // Past expiresAt

interface TxOutput {
  address: string;
  amount: number;                // Satoshis
  label?: string;                // Description
}

interface TxInput {
  txid: string;
  vout: number;
  amount: number;                // Satoshis (required for signing)
  scriptPubkey: string;          // The multisig's P2TR scriptPubkey
}

interface SignatureEntry {
  agentId: string;
  xOnlyPubkey: string;
  signature: string;             // 64-byte Schnorr signature (hex)
  signedAt: Date;
}
```

### Signing Payload

```typescript
interface SigningPayload {
  proposalId: string;
  agentId: string;
  
  // What to sign
  sighash: string;               // 32-byte hash to sign (hex)
  sighashType: number;           // Usually 0x00 (SIGHASH_DEFAULT) for Taproot
  
  // Context for verification
  message: string;               // Human-readable description
  outputs: TxOutput[];           // What this tx does
  inputAmount: number;           // Total input sats
  outputAmount: number;          // Total output sats
  fee: number;                   // Fee in sats
  
  // For wallet providers that need full PSBT
  psbt: string;                  // Base64 PSBT
  inputIndex: number;            // Which input to sign (usually 0)
}
```

---

## API Specification

### Base URL

```
https://api.agentmultisig.dev/v1
```

### Authentication

All requests require agent authentication via signed challenge:

```
Authorization: Agent <agent_id>:<timestamp>:<signature>
```

Where signature is over `SHA256(agent_id || timestamp || request_body_hash)`.

---

### Multisig Endpoints

#### Create Multisig

```http
POST /multisigs
Content-Type: application/json

{
  "name": "Trading Committee",
  "network": "mainnet",
  "agents": [
    {
      "id": "agent-alpha",
      "name": "Alpha Trading Bot",
      "xOnlyPubkey": "a1b2c3...",
      "provider": "aibtc"
    },
    {
      "id": "agent-beta",
      "name": "Beta Risk Manager", 
      "xOnlyPubkey": "d4e5f6...",
      "provider": "agentkit"
    },
    {
      "id": "agent-gamma",
      "name": "Gamma Auditor",
      "xOnlyPubkey": "789abc...",
      "provider": "crossmint"
    }
  ],
  "threshold": 2
}
```

**Response:**

```json
{
  "id": "multisig_abc123",
  "name": "Trading Committee",
  "network": "mainnet",
  "address": "bc1p9yjaffzhuh5fzq2yj5de6cmj4lgcdtj7n4dena0zxtatdmq6s8sql9805p",
  "internalPubkey": "0250929b74c1a04954b78b4b6035e97a5e078a5a0f28ec96d547bfee9ace803ac0",
  "merkleRoot": "ab34ef...",
  "tweakedPubkey": "2c5f4a...",
  "threshold": 2,
  "agents": [...],
  "scriptTree": {
    "leaves": [
      {
        "index": 0,
        "signerAgentIds": ["agent-alpha", "agent-beta"],
        "script": "20a1b2c3...ac2064d5e6...ba",
        "controlBlock": "c0..."
      },
      {
        "index": 1,
        "signerAgentIds": ["agent-alpha", "agent-gamma"],
        "script": "20a1b2c3...ac20789abc...ba",
        "controlBlock": "c0..."
      },
      {
        "index": 2,
        "signerAgentIds": ["agent-beta", "agent-gamma"],
        "script": "20d4e5f6...ac20789abc...ba",
        "controlBlock": "c0..."
      }
    ],
    "root": "ab34ef..."
  },
  "createdAt": "2026-02-18T16:00:00Z",
  "createdBy": "agent-alpha"
}
```

#### Get Multisig

```http
GET /multisigs/:id
```

**Response:** Multisig object with current balance

```json
{
  ...multisig,
  "balance": {
    "confirmed": 1000000,
    "unconfirmed": 0,
    "utxos": [
      {
        "txid": "abc123...",
        "vout": 0,
        "amount": 1000000,
        "confirmations": 6
      }
    ]
  }
}
```

#### List Multisigs for Agent

```http
GET /agents/:agent_id/multisigs
```

---

### Proposal Endpoints

#### Create Proposal

```http
POST /proposals
Content-Type: application/json

{
  "multisigId": "multisig_abc123",
  "outputs": [
    {
      "address": "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
      "amount": 500000,
      "label": "Exchange deposit"
    }
  ],
  "feeRate": 10,
  "note": "Deposit to exchange for trading",
  "expiresIn": 86400
}
```

**Response:**

```json
{
  "id": "prop_xyz789",
  "multisigId": "multisig_abc123",
  "status": "pending",
  "outputs": [...],
  "feeRate": 10,
  "fee": 1540,
  "inputs": [
    {
      "txid": "abc123...",
      "vout": 0,
      "amount": 1000000,
      "scriptPubkey": "5120..."
    }
  ],
  "changeOutput": {
    "address": "bc1p9yjaff...",
    "amount": 498460
  },
  "selectedLeafIndex": 0,
  "requiredSigners": ["agent-alpha", "agent-beta"],
  "unsignedPsbt": "cHNidP8BAH...",
  "signatures": [],
  "createdAt": "2026-02-18T16:30:00Z",
  "createdBy": "agent-alpha",
  "expiresAt": "2026-02-19T16:30:00Z",
  "note": "Deposit to exchange for trading"
}
```

#### Get Proposal

```http
GET /proposals/:id
```

#### List Proposals

```http
GET /multisigs/:multisig_id/proposals?status=pending
GET /agents/:agent_id/proposals?status=pending
```

#### Get Signing Payload

Returns the specific data an agent needs to sign.

```http
GET /proposals/:id/signing-payload/:agent_id
```

**Response:**

```json
{
  "proposalId": "prop_xyz789",
  "agentId": "agent-alpha",
  "sighash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "sighashType": 0,
  "message": "Send 500,000 sats to bc1qxy2... (Exchange deposit). Fee: 1,540 sats.",
  "outputs": [
    {
      "address": "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
      "amount": 500000,
      "label": "Exchange deposit"
    }
  ],
  "inputAmount": 1000000,
  "outputAmount": 998460,
  "fee": 1540,
  "psbt": "cHNidP8BAH...",
  "inputIndex": 0
}
```

#### Sign Proposal

```http
POST /proposals/:id/sign
Content-Type: application/json

{
  "agentId": "agent-alpha",
  "signature": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
}
```

**Response:**

```json
{
  "proposalId": "prop_xyz789",
  "status": "pending",
  "signatures": [
    {
      "agentId": "agent-alpha",
      "xOnlyPubkey": "a1b2c3...",
      "signature": "e3b0c44...",
      "signedAt": "2026-02-18T16:35:00Z"
    }
  ],
  "requiredSigners": ["agent-alpha", "agent-beta"],
  "remainingSigners": ["agent-beta"],
  "thresholdMet": false
}
```

#### Finalize Proposal

Called when threshold is met. Constructs final witness.

```http
POST /proposals/:id/finalize
```

**Response:**

```json
{
  "proposalId": "prop_xyz789",
  "status": "finalized",
  "signedPsbt": "cHNidP8BAH...",
  "finalTx": "02000000...",
  "txid": "abc123...",
  "readyToBroadcast": true
}
```

#### Broadcast Proposal

```http
POST /proposals/:id/broadcast
```

**Response:**

```json
{
  "proposalId": "prop_xyz789",
  "status": "broadcast",
  "txid": "abc123def456...",
  "broadcastAt": "2026-02-18T16:40:00Z"
}
```

#### Reject Proposal

```http
POST /proposals/:id/reject
Content-Type: application/json

{
  "agentId": "agent-beta",
  "reason": "Amount too high for current market conditions"
}
```

---

### Webhook Notifications

Agents can register webhooks to receive notifications:

```http
POST /agents/:agent_id/webhooks
Content-Type: application/json

{
  "url": "https://agent-beta.example.com/webhook",
  "events": ["proposal.created", "proposal.signed", "proposal.ready", "proposal.broadcast"],
  "secret": "webhook_secret_123"
}
```

**Webhook Payload:**

```json
{
  "event": "proposal.created",
  "timestamp": "2026-02-18T16:30:00Z",
  "data": {
    "proposalId": "prop_xyz789",
    "multisigId": "multisig_abc123",
    "multisigName": "Trading Committee",
    "createdBy": "agent-alpha",
    "requiredSigners": ["agent-alpha", "agent-beta"],
    "outputs": [...],
    "note": "Deposit to exchange for trading"
  },
  "signature": "HMAC-SHA256 of payload with secret"
}
```

---

## Signing Flow

### Complete Sequence Diagram

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌────────────┐     ┌─────────┐
│  Agent α │     │  Agent β │     │  Agent γ │     │ Coord API  │     │ Bitcoin │
└────┬─────┘     └────┬─────┘     └────┬─────┘     └─────┬──────┘     └────┬────┘
     │                │                │                 │                 │
     │ ══════════════════════ SETUP (one-time) ══════════════════════════ │
     │                │                │                 │                 │
     │──── Register pubkey ──────────────────────────────▶                 │
     │                │──── Register pubkey ─────────────▶                 │
     │                │                │── Register pk ──▶                 │
     │                │                │                 │                 │
     │────────────── Create Multisig (2-of-3) ─────────────▶│                 │
     │◀───────────── Multisig created, address: bc1p... ────│                 │
     │                │                │                 │                 │
     │ ═══════════════════════ PROPOSAL ═════════════════════════════════ │
     │                │                │                 │                 │
     │─────────────── Create Proposal ──────────────────▶│                 │
     │                │                │                 │──── Get UTXOs ──▶
     │                │                │                 │◀─── UTXOs ──────│
     │                │                │                 │                 │
     │                │                │                 │ Build PSBT      │
     │                │                │                 │ Select leaf     │
     │                │                │                 │ Compute sighash │
     │                │                │                 │                 │
     │◀──────────── Proposal created, need α + β ────────│                 │
     │                │◀─── Webhook: new proposal ───────│                 │
     │                │                │                 │                 │
     │ ═══════════════════════ SIGNING ══════════════════════════════════ │
     │                │                │                 │                 │
     │─── Get signing payload ──────────────────────────▶│                 │
     │◀─── Sighash + context ───────────────────────────│                 │
     │                │                │                 │                 │
     │ Sign with      │                │                 │                 │
     │ wallet provider│                │                 │                 │
     │                │                │                 │                 │
     │─── Submit signature ─────────────────────────────▶│                 │
     │◀─── Ack, 1/2 signatures ─────────────────────────│                 │
     │                │◀─── Webhook: α signed ───────────│                 │
     │                │                │                 │                 │
     │                │─── Get signing payload ─────────▶│                 │
     │                │◀─── Sighash + context ──────────│                 │
     │                │                │                 │                 │
     │                │ Sign with      │                 │                 │
     │                │ wallet provider│                 │                 │
     │                │                │                 │                 │
     │                │─── Submit signature ────────────▶│                 │
     │                │◀─── Ack, 2/2 ✓ threshold met ───│                 │
     │◀──────────────────── Webhook: ready ─────────────│                 │
     │                │                │                 │                 │
     │ ═══════════════════ FINALIZE + BROADCAST ═════════════════════════ │
     │                │                │                 │                 │
     │─── Finalize ─────────────────────────────────────▶│                 │
     │                │                │                 │ Build witness   │
     │                │                │                 │ Complete PSBT   │
     │◀─── Final tx ready ──────────────────────────────│                 │
     │                │                │                 │                 │
     │─── Broadcast ────────────────────────────────────▶│                 │
     │                │                │                 │──── Submit tx ──▶
     │                │                │                 │◀─── txid ───────│
     │◀─── Broadcast complete, txid ────────────────────│                 │
     │                │◀─── Webhook: broadcast ─────────│                 │
     │                │                │◀── Webhook ────│                 │
     │                │                │                 │                 │
```

### Signature Construction Details

#### 1. Computing the Sighash

For Taproot script-path spending, the sighash is computed per BIP 341:

```
sighash = SHA256(
  epoch ||                    // 0x00
  hash_type ||                // 0x00 for SIGHASH_DEFAULT
  version ||                  // tx version
  locktime ||                 // tx locktime
  sha256(prevouts) ||         // hash of all input outpoints
  sha256(amounts) ||          // hash of all input amounts
  sha256(scriptpubkeys) ||    // hash of all input scriptPubKeys
  sha256(sequences) ||        // hash of all input sequences
  sha256(outputs) ||          // hash of all outputs
  spend_type ||               // 0x03 for script-path with annex absent
  input_index ||              // which input (as uint32)
  tapleaf_hash ||             // tagged hash of leaf being spent
  key_version ||              // 0x00
  codesep_pos                 // 0xffffffff if no OP_CODESEPARATOR
)
```

#### 2. Schnorr Signature

Each agent signs the sighash with their private key:

```
signature = schnorr_sign(private_key, sighash)
```

Result is 64 bytes (no sighash byte appended for SIGHASH_DEFAULT).

#### 3. Witness Assembly

For a 2-of-3 with agents α and β signing:

```
witness = [
  <sig_γ or empty>,           // 0x00 (empty - γ didn't sign)
  <sig_β>,                    // 64 bytes
  <sig_α>,                    // 64 bytes  
  <script>,                   // The Tapscript being satisfied
  <control_block>             // Leaf version + internal key + merkle path
]
```

Note: Signatures in reverse order of pubkeys in script.

---

## Security Considerations

### Key Management

1. **Coordination API never holds private keys** - Only receives signatures
2. **Each agent responsible for own key security** - Via their wallet provider
3. **No key derivation by API** - Agents provide x-only pubkeys directly

### Replay Protection

1. **Unique proposal IDs** - UUID v4, never reused
2. **Sighash commits to full tx** - Cannot reuse signature for different tx
3. **UTXO consumption** - Spent UTXOs can't be double-spent

### PSBT Verification

Before signing, agents SHOULD verify:

1. **Output addresses** - Match expected recipients
2. **Amounts** - Within acceptable limits
3. **Fee rate** - Not excessively high (fee siphoning attack)
4. **Change address** - Returns to multisig address
5. **Input ownership** - UTXOs belong to the multisig

### Timing Attacks

1. **Proposal expiration** - Auto-reject stale proposals
2. **Rate limiting** - Prevent proposal spam
3. **Cooldown periods** - Optional delay between proposals

### Witness Privacy

Script-path spending reveals:
- Which agents signed (their pubkeys)
- The threshold structure (m-of-n)
- The specific leaf used

This is inherent to Tapscript; not avoidable without MuSig2 key-path.

---

## Example Walkthrough

### Scenario

Three AI agents manage a shared trading fund:
- **Agent Alpha** (aibtc) - Primary trader
- **Agent Beta** (AgentKit) - Risk manager  
- **Agent Gamma** (Crossmint) - Auditor

Threshold: 2-of-3

### Step 1: Create Multisig

```bash
curl -X POST https://api.agentmultisig.dev/v1/multisigs \
  -H "Authorization: Agent agent-alpha:1708272000:sig..." \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Trading Fund",
    "network": "mainnet",
    "threshold": 2,
    "agents": [
      {"id": "agent-alpha", "xOnlyPubkey": "a1b2c3...", "provider": "aibtc"},
      {"id": "agent-beta", "xOnlyPubkey": "d4e5f6...", "provider": "agentkit"},
      {"id": "agent-gamma", "xOnlyPubkey": "789abc...", "provider": "crossmint"}
    ]
  }'
```

Response includes multisig address: `bc1p9yjaffzhuh5fzq2yj5de6cmj4lgcdtj7n4dena0zxtatdmq6s8sql9805p`

### Step 2: Fund the Multisig

External deposit of 0.01 BTC to multisig address.

### Step 3: Propose Withdrawal

Agent Alpha proposes sending 500k sats to an exchange:

```bash
curl -X POST https://api.agentmultisig.dev/v1/proposals \
  -H "Authorization: Agent agent-alpha:1708272100:sig..." \
  -H "Content-Type: application/json" \
  -d '{
    "multisigId": "multisig_abc123",
    "outputs": [{"address": "bc1qexchange...", "amount": 500000}],
    "feeRate": 10,
    "note": "Weekly exchange deposit"
  }'
```

API selects leaf 0 (α + β) since Alpha is proposing.

### Step 4: Alpha Signs

```bash
# Get signing payload
curl https://api.agentmultisig.dev/v1/proposals/prop_xyz/signing-payload/agent-alpha

# Returns sighash: e3b0c442...

# Agent Alpha signs via aibtc
aibtc sign --message e3b0c442...
# Returns signature: a1b2c3d4...

# Submit signature
curl -X POST https://api.agentmultisig.dev/v1/proposals/prop_xyz/sign \
  -d '{"agentId": "agent-alpha", "signature": "a1b2c3d4..."}'
```

### Step 5: Beta Reviews and Signs

Agent Beta receives webhook notification. Reviews the proposal:

```bash
curl https://api.agentmultisig.dev/v1/proposals/prop_xyz
```

Verifies outputs are acceptable, then signs:

```bash
# Get signing payload
curl https://api.agentmultisig.dev/v1/proposals/prop_xyz/signing-payload/agent-beta

# Sign via AgentKit
agentkit sign e3b0c442...

# Submit
curl -X POST https://api.agentmultisig.dev/v1/proposals/prop_xyz/sign \
  -d '{"agentId": "agent-beta", "signature": "f6e5d4c3..."}'
```

### Step 6: Finalize and Broadcast

Threshold met (2 of 2 required signers). Any agent can finalize:

```bash
curl -X POST https://api.agentmultisig.dev/v1/proposals/prop_xyz/finalize

curl -X POST https://api.agentmultisig.dev/v1/proposals/prop_xyz/broadcast
# Returns: {"txid": "abc123def456..."}
```

---

## Cross-Chain Portability

This API is designed to translate cleanly to other chains. Here's how the concepts map:

### Core Abstractions (Chain-Agnostic)

| Concept | Bitcoin | Stacks | EVM |
|---------|---------|--------|-----|
| **Multisig Address** | P2TR script-path | Multi-principal | Gnosis Safe / custom contract |
| **Proposal** | Unsigned PSBT | Unsigned tx + structured data | Unsigned tx hash |
| **Signing Payload** | Sighash (BIP 341) | SIP-018 structured data | EIP-712 typed data |
| **Signature Format** | 64-byte Schnorr | 65-byte recoverable ECDSA | 65-byte recoverable ECDSA |
| **Threshold Check** | Script execution | Contract logic | Contract logic |
| **Broadcast** | Bitcoin P2P | Stacks node | EVM RPC |

### What Stays the Same

1. **Agent model** - `{id, name, publicKey, provider}` works everywhere
2. **Multisig model** - `{agents[], threshold, address}` is universal
3. **Proposal lifecycle** - Create → Sign → Finalize → Broadcast
4. **API endpoints** - Same REST interface, different chain-specific fields
5. **Webhook notifications** - Identical across chains
6. **Async coordination** - Core value prop, chain-independent

### What Changes Per Chain

1. **Address derivation** - Chain-specific (P2TR vs principal vs 0x address)
2. **Sighash computation** - BIP 341 vs SIP-018 vs EIP-712
3. **Signature aggregation** - Script witness vs contract call args
4. **Fee model** - sat/vB vs microSTX vs gwei

### Proposed Multi-Chain API Extension

```typescript
// Chain-specific configuration
interface ChainConfig {
  chainId: string;              // 'bitcoin-mainnet' | 'stacks-mainnet' | 'ethereum' | 'base'
  type: 'utxo' | 'account';     // UTXO model vs account model
  signatureScheme: 'schnorr' | 'ecdsa' | 'secp256k1';
  addressFormat: 'bech32m' | 'c32' | 'evm';
}

// Generic multisig (chain-aware)
interface Multisig {
  id: string;
  chain: ChainConfig;
  agents: Agent[];
  threshold: number;
  address: string;              // Chain-appropriate format
  
  // Chain-specific details
  bitcoin?: {
    internalPubkey: string;
    scriptTree: TapTree;
  };
  stacks?: {
    principals: string[];       // SP... addresses
  };
  evm?: {
    contractAddress: string;
    implementationType: 'gnosis-safe' | 'custom';
  };
}

// Generic signing payload
interface SigningPayload {
  proposalId: string;
  agentId: string;
  chain: string;
  
  // What to sign (chain-specific format)
  digest: string;               // Always 32-byte hex hash
  
  // Human context (always present)
  message: string;
  outputs: {address: string; amount: string; asset?: string}[];
  fee: string;
  
  // Chain-specific raw data
  raw: {
    bitcoin?: { psbt: string; sighashType: number };
    stacks?: { domain: object; message: object };
    evm?: { domain: object; types: object; value: object };
  };
}
```

### Migration Path

1. **Phase 1 (now)**: Bitcoin PSBT with P2TR - this spec
2. **Phase 2**: Add Stacks support - same API, SIP-018 signing
3. **Phase 3**: Add EVM support - same API, EIP-712 signing, Gnosis Safe integration
4. **Phase 4**: Cross-chain proposals - atomic swaps, bridge coordination

### PSBT as Universal Mental Model

Even on non-UTXO chains, we can think in PSBT terms:

- **Partially Signed** = Proposal with some signatures
- **Combine** = Collecting signatures from multiple agents  
- **Finalize** = Threshold reached, ready to execute
- **Extract** = Get the final transaction/call data
- **Broadcast** = Submit to network

The coordination layer is the same; only the cryptographic details change.

---

## Appendix: Tapscript Construction

### Generating the Script Tree

For 2-of-3 with agents [A, B, C]:

```python
def build_2of3_tapscripts(pubkeys):
    """
    pubkeys: list of 3 x-only pubkeys (32 bytes each, hex)
    Returns: list of TapLeaf objects
    """
    from itertools import combinations
    
    leaves = []
    for i, (pk1, pk2) in enumerate(combinations(pubkeys, 2)):
        # Sort pubkeys for deterministic script
        pk1, pk2 = sorted([pk1, pk2])
        
        # Build script: <pk1> CHECKSIG <pk2> CHECKSIGADD 2 NUMEQUAL
        script = (
            bytes.fromhex('20') +       # Push 32 bytes
            bytes.fromhex(pk1) +        # pubkey 1
            bytes.fromhex('ac') +       # OP_CHECKSIG
            bytes.fromhex('20') +       # Push 32 bytes
            bytes.fromhex(pk2) +        # pubkey 2
            bytes.fromhex('ba') +       # OP_CHECKSIGADD
            bytes.fromhex('52') +       # OP_2
            bytes.fromhex('9c')         # OP_NUMEQUAL
        )
        
        leaves.append({
            'index': i,
            'script': script.hex(),
            'signers': [pk1, pk2]
        })
    
    return leaves
```

### Computing the Merkle Root

```python
def tagged_hash(tag, data):
    tag_hash = hashlib.sha256(tag.encode()).digest()
    return hashlib.sha256(tag_hash + tag_hash + data).digest()

def tapbranch(a, b):
    # Lexicographically sort
    if a > b:
        a, b = b, a
    return tagged_hash('TapBranch', a + b)

def tapleaf_hash(script, leaf_version=0xc0):
    return tagged_hash('TapLeaf', bytes([leaf_version]) + compact_size(len(script)) + script)

def build_merkle_root(leaves):
    """Build Merkle root from leaf hashes"""
    hashes = [tapleaf_hash(bytes.fromhex(leaf['script'])) for leaf in leaves]
    
    while len(hashes) > 1:
        next_level = []
        for i in range(0, len(hashes), 2):
            if i + 1 < len(hashes):
                next_level.append(tapbranch(hashes[i], hashes[i+1]))
            else:
                next_level.append(hashes[i])
        hashes = next_level
    
    return hashes[0]
```

### Computing the Tweaked Pubkey

```python
def tweak_pubkey(internal_pubkey, merkle_root):
    """
    internal_pubkey: 32-byte x-only pubkey
    merkle_root: 32-byte merkle root
    Returns: tweaked x-only pubkey
    """
    tweak = tagged_hash('TapTweak', internal_pubkey + merkle_root)
    
    # P = lift_x(internal_pubkey)
    # Q = P + tweak*G
    # Return x(Q)
    
    # Use secp256k1 library for actual computation
    from secp256k1 import PublicKey
    
    P = PublicKey(b'\x02' + internal_pubkey, raw=True)
    Q = P.tweak_add(tweak)
    return Q.serialize()[1:]  # x-only
```

### Control Block Construction

```python
def build_control_block(internal_pubkey, leaf_index, merkle_path, leaf_version=0xc0):
    """
    Build control block for spending via a specific leaf
    """
    # First byte: leaf_version | parity_bit
    # parity_bit is 0 or 1 based on tweaked pubkey y-coordinate
    
    parity = get_tweaked_parity(internal_pubkey, merkle_root)
    first_byte = leaf_version | parity
    
    control_block = bytes([first_byte]) + internal_pubkey + merkle_path
    return control_block.hex()
```

---

## Changelog

- **v0.1.0** (2026-02-18): Initial specification

---

*End of specification.*
