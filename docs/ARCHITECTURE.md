# Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         AGENT MULTISIG SYSTEM                           │
└─────────────────────────────────────────────────────────────────────────┘

    ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐
    │ Agent A  │   │ Agent B  │   │ Agent C  │   │ Agent D  │
    │ (aibtc)  │   │(clawcash)│   │ (bankr)  │   │ (custom) │
    └────┬─────┘   └────┬─────┘   └────┬─────┘   └────┬─────┘
         │              │              │              │
         │   ┌──────────┴──────────────┴──────────────┘
         │   │
    ┌────▼───▼───────────────────────────────────────────────────────┐
    │                    COORDINATION API                             │
    │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
    │  │   Agents    │  │  Multisigs  │  │  Proposals  │             │
    │  │   Service   │  │   Service   │  │   Service   │             │
    │  └─────────────┘  └─────────────┘  └─────────────┘             │
    │                                                                 │
    │  ┌─────────────────────────────────────────────────────────┐   │
    │  │                    ADAPTER LAYER                         │   │
    │  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐        │   │
    │  │  │ Taproot │ │EVM Safe │ │ Stacks  │ │ Squads  │        │   │
    │  │  │ (PSBT)  │ │(EIP-712)│ │(SIP-018)│ │(ed25519)│        │   │
    │  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘        │   │
    │  └─────────────────────────────────────────────────────────┘   │
    └────────────────────────┬───────────────────────────────────────┘
                             │
         ┌───────────────────┼───────────────────┐
         │                   │                   │
    ┌────▼────┐        ┌─────▼─────┐       ┌────▼────┐
    │ Bitcoin │        │  Ethereum │       │ Solana  │
    │ Network │        │  Base     │       │ Network │
    │         │        │  Arbitrum │       │         │
    └─────────┘        └───────────┘       └─────────┘
```

## Request Flow

### Creating a Multisig

```
Agent A                Coordination API              Bitcoin Network
   │                          │                            │
   │  POST /v1/multisigs      │                            │
   │  {threshold:2, agents:[]}│                            │
   │─────────────────────────>│                            │
   │                          │                            │
   │                          │  Generate Taproot Address  │
   │                          │  (P2TR with script tree)   │
   │                          │                            │
   │  {id, address: "bc1p.."} │                            │
   │<─────────────────────────│                            │
   │                          │                            │
   │  Fund the address        │                            │
   │───────────────────────────────────────────────────────>
```

### Signing a Proposal

```
Agent A          Coordination API          Agent B          Agent C
   │                    │                     │                 │
   │ POST /v1/proposals │                     │                 │
   │ {outputs:[...]}    │                     │                 │
   │───────────────────>│                     │                 │
   │                    │                     │                 │
   │                    │  Webhook: new proposal               │
   │                    │────────────────────>│                 │
   │                    │────────────────────────────────────> │
   │                    │                     │                 │
   │ GET payload/agentA │                     │                 │
   │───────────────────>│                     │                 │
   │                    │                     │                 │
   │ {digest: "abc.."}  │                     │                 │
   │<───────────────────│                     │                 │
   │                    │                     │                 │
   │ [Sign with aibtc]  │                     │                 │
   │                    │                     │                 │
   │ POST /sign         │                     │                 │
   │ {signature: "..."}│                     │                 │
   │───────────────────>│                     │                 │
   │                    │                     │                 │
   │ {1/2 signatures}   │                     │                 │
   │<───────────────────│                     │                 │
   │                    │                     │                 │
   │                    │     GET payload/agentB               │
   │                    │<────────────────────│                 │
   │                    │                     │                 │
   │                    │     {digest: ".."}  │                 │
   │                    │────────────────────>│                 │
   │                    │                     │                 │
   │                    │     [Sign with clawcash]             │
   │                    │                     │                 │
   │                    │     POST /sign      │                 │
   │                    │<────────────────────│                 │
   │                    │                     │                 │
   │                    │     THRESHOLD MET!  │                 │
   │                    │     {2/2 signatures}│                 │
   │                    │────────────────────>│                 │
   │                    │                     │                 │
   │ POST /finalize     │                     │                 │
   │───────────────────>│                     │                 │
   │                    │                     │                 │
   │                    │     Broadcast tx    │                 │
   │                    │─────────────────────────────────────> │
   │                    │                     │                 │
   │ {txid: "..."}      │                     │                 │
   │<───────────────────│                     │                 │
```

## Adapter Architecture

### Bitcoin (Taproot P2TR)

```
┌────────────────────────────────────────────────────────────┐
│                    TAPROOT MULTISIG                         │
├────────────────────────────────────────────────────────────┤
│                                                             │
│   Internal Key: NUMS point (unspendable)                   │
│                                                             │
│   Script Tree (2-of-3 example):                            │
│                                                             │
│                    [Root]                                   │
│                   /      \                                  │
│             [Branch]    [Leaf C]                           │
│              /    \      └─ A+B checksig                   │
│         [Leaf A] [Leaf B]                                  │
│          └─ A+C   └─ B+C                                   │
│                                                             │
│   Signing Flow:                                            │
│   1. Create PSBT with inputs/outputs                       │
│   2. Each agent computes their sighash (BIP-341)           │
│   3. Agent signs with schnorr_sign_digest                  │
│   4. Coordinator finds valid leaf, builds witness          │
│   5. Broadcast with: <sig_A> <sig_B> <script> <ctrl_block> │
│                                                             │
└────────────────────────────────────────────────────────────┘
```

### EVM (Safe/Gnosis)

```
┌────────────────────────────────────────────────────────────┐
│                      SAFE MULTISIG                          │
├────────────────────────────────────────────────────────────┤
│                                                             │
│   Safe Contract (CREATE2 deployed):                        │
│   ┌──────────────────────────────┐                         │
│   │ owners: [A, B, C]            │                         │
│   │ threshold: 2                 │                         │
│   │ nonce: 0                     │                         │
│   └──────────────────────────────┘                         │
│                                                             │
│   Signing Flow:                                            │
│   1. Build SafeTx struct (to, value, data, etc.)          │
│   2. Compute safeTxHash (EIP-712 typed data hash)         │
│   3. Each owner signs with eth_signTypedData_v4           │
│   4. Coordinator collects signatures                       │
│   5. Call execTransaction(to, value, data, ..., sigs)     │
│                                                             │
│   EIP-712 Domain:                                          │
│   ┌──────────────────────────────┐                         │
│   │ name: "Safe"                 │                         │
│   │ version: "1.3.0"             │                         │
│   │ chainId: 1/8453/42161        │                         │
│   │ verifyingContract: 0x...     │                         │
│   └──────────────────────────────┘                         │
│                                                             │
└────────────────────────────────────────────────────────────┘
```

### Stacks (SIP-018)

```
┌────────────────────────────────────────────────────────────┐
│                    STACKS MULTISIG                          │
├────────────────────────────────────────────────────────────┤
│                                                             │
│   SIP-018 Structured Data Signing:                         │
│                                                             │
│   messageHash = SHA256(                                    │
│     "SIP018" ||                                            │
│     SHA256(domain_tuple_wire_format) ||                    │
│     SHA256(structured_data_wire_format)                    │
│   )                                                         │
│                                                             │
│   Domain:                                                   │
│   { name: "agent-multisig", version: "1", chain-id: u1 }   │
│                                                             │
│   Proposal Data (Clarity tuple):                           │
│   {                                                         │
│     multisig-id: (string-ascii 64),                        │
│     proposal-id: (string-ascii 64),                        │
│     action: "transfer",                                    │
│     amount: uint,                                          │
│     nonce: uint                                            │
│   }                                                         │
│                                                             │
│   Signature: secp256k1 ECDSA, RSV format (65 bytes)        │
│                                                             │
└────────────────────────────────────────────────────────────┘
```

### Solana (Squads)

```
┌────────────────────────────────────────────────────────────┐
│                    SQUADS MULTISIG                          │
├────────────────────────────────────────────────────────────┤
│                                                             │
│   PDAs (Program Derived Addresses):                        │
│   ┌──────────────────────────────┐                         │
│   │ Squad PDA (multisig config)  │                         │
│   │ ├─ members: [A, B, C]        │                         │
│   │ ├─ threshold: 2              │                         │
│   │ └─ txIndex: 5                │                         │
│   └──────────────────────────────┘                         │
│              │                                              │
│              ▼                                              │
│   ┌──────────────────────────────┐                         │
│   │ Vault PDA (holds assets)     │                         │
│   └──────────────────────────────┘                         │
│              │                                              │
│              ▼                                              │
│   ┌──────────────────────────────┐                         │
│   │ Transaction PDA              │                         │
│   │ ├─ instructions: [...]       │                         │
│   │ ├─ approvals: [A, B]         │                         │
│   │ └─ status: approved          │                         │
│   └──────────────────────────────┘                         │
│                                                             │
│   Signing Flow:                                            │
│   1. Create transaction (stores instructions in PDA)       │
│   2. Each member calls approveTransaction (on-chain tx)    │
│   3. When threshold met, call executeTransaction           │
│                                                             │
│   Signature: ed25519 (64 bytes) - NOT secp256k1!           │
│                                                             │
└────────────────────────────────────────────────────────────┘
```

## Data Model

```
┌─────────────────┐       ┌─────────────────┐
│     Agent       │       │    Multisig     │
├─────────────────┤       ├─────────────────┤
│ id              │       │ id              │
│ name            │──┐    │ name            │
│ publicKey       │  │    │ chainId         │
│ provider        │  │    │ address         │
│ webhookUrl      │  │    │ threshold       │
│ createdAt       │  │    │ createdAt       │
└─────────────────┘  │    └────────┬────────┘
                     │             │
                     │    ┌────────▼────────┐
                     │    │  MultisigAgent  │
                     │    ├─────────────────┤
                     └───>│ multisigId      │
                          │ agentId         │
                          │ publicKey       │
                          │ index           │
                          └─────────────────┘

┌─────────────────┐       ┌─────────────────┐
│    Proposal     │       │   Signature     │
├─────────────────┤       ├─────────────────┤
│ id              │       │ id              │
│ multisigId      │◄──────│ proposalId      │
│ status          │       │ agentId         │
│ outputs[]       │       │ signature       │
│ note            │       │ inputIndex      │
│ psbtHex         │       │ createdAt       │
│ createdAt       │       └─────────────────┘
└─────────────────┘
```

## Security Model

```
┌─────────────────────────────────────────────────────────────────┐
│                     SECURITY BOUNDARIES                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    AGENT DOMAIN                          │    │
│  │                                                          │    │
│  │  • Private keys NEVER leave agent                       │    │
│  │  • Agent validates PSBT before signing                  │    │
│  │  • Agent controls when/what to sign                     │    │
│  │                                                          │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │                                   │
│                              │ Public key, signatures            │
│                              ▼                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                 COORDINATION DOMAIN                      │    │
│  │                                                          │    │
│  │  • Never sees private keys                              │    │
│  │  • Validates signatures cryptographically               │    │
│  │  • Enforces threshold requirements                      │    │
│  │  • Manages state (proposals, signatures)                │    │
│  │                                                          │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │                                   │
│                              │ Signed transactions               │
│                              ▼                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                   NETWORK DOMAIN                         │    │
│  │                                                          │    │
│  │  • Validates transaction format                         │    │
│  │  • Validates signatures (consensus rules)               │    │
│  │  • Executes transaction if valid                        │    │
│  │                                                          │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```
