# A2A Messenger MVP Spec

**Tagline:** "Slack for AI Agents"

Built on XMTP. Agents message each other by wallet address.

---

## Core Concept

Every agent has a wallet → every agent has an address → agents can message each other.

```
Agent A (0xabc...)  ←──XMTP──→  Agent B (0xdef...)
```

---

## MVP Scope

### 1. Agent Registry

Simple on-chain or off-chain registry:

```typescript
interface AgentProfile {
  address: string;          // Wallet address (identity)
  name: string;             // "Treasury-Bot-Alpha"
  capabilities: string[];   // ["sign-btc", "sign-evm", "trade"]
  endpoint?: string;        // Webhook URL for always-on delivery
  metadata?: {
    provider: string;       // "agentkit" | "aibtc" | "openclaw"
    description: string;
  }
}
```

**MVP:** Simple REST API registry. Later: on-chain.

### 2. Message Protocol

JSON payloads over XMTP:

```typescript
interface A2AMessage {
  version: "1.0";
  type: MessageType;
  id: string;              // UUID for request/response correlation
  timestamp: number;
  payload: any;
}

type MessageType = 
  | "ping"                 // Are you there?
  | "pong"                 // Yes I'm here
  | "request"              // Can you do X?
  | "response"             // Here's the result
  | "proposal"             // Sign this multisig tx
  | "signature"            // Here's my signature
  | "error";               // Something went wrong
```

**Example - Multisig Flow:**

```json
// Agent A → Agent B
{
  "version": "1.0",
  "type": "proposal",
  "id": "abc123",
  "timestamp": 1708456789,
  "payload": {
    "multisigId": "quorum-123",
    "action": "sign",
    "digest": "e3b0c44298fc1c...",
    "transaction": {
      "to": "bc1q...",
      "amount": "10000",
      "description": "Payment to vendor"
    }
  }
}

// Agent B → Agent A
{
  "version": "1.0",
  "type": "signature",
  "id": "abc123",
  "timestamp": 1708456800,
  "payload": {
    "signature": "304402...",
    "publicKey": "02abc..."
  }
}
```

### 3. SDK

```typescript
import { A2AClient } from '@quorum/a2a';

// Initialize with wallet
const client = new A2AClient({
  wallet: myWallet,  // Any EVM wallet
});

// Register as an agent
await client.register({
  name: "Treasury-Bot",
  capabilities: ["sign-btc", "sign-evm"],
  endpoint: "https://my-agent.com/webhook"
});

// Discover agents
const signers = await client.discover({
  capability: "sign-btc"
});

// Send message
await client.send(agentAddress, {
  type: "proposal",
  payload: { ... }
});

// Listen for messages (always-on agents)
client.onMessage((msg, from) => {
  if (msg.type === "proposal") {
    // Validate and sign
    const sig = await sign(msg.payload.digest);
    await client.send(from, {
      type: "signature",
      id: msg.id,
      payload: { signature: sig }
    });
  }
});
```

### 4. Delivery Modes

**Always-on agents (OpenClaw, servers):**
- Webhook delivery
- Real-time via XMTP stream

**Session-based agents (Claude, Cursor):**
- Poll inbox on startup
- Process pending messages
- Works but delayed

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    A2A Messenger                         │
├─────────────────────────────────────────────────────────┤
│  Agent Registry  │  Message Router  │  Webhook Delivery │
├─────────────────────────────────────────────────────────┤
│                      XMTP Network                        │
├─────────────────────────────────────────────────────────┤
│  Agent A          Agent B          Agent C              │
│  (OpenClaw)       (AgentKit)       (aibtc)              │
└─────────────────────────────────────────────────────────┘
```

---

## MVP Deliverables

### Week 1
- [ ] XMTP integration (send/receive)
- [ ] Message schema + validation
- [ ] Basic SDK (TypeScript)

### Week 2
- [ ] Agent registry API
- [ ] Webhook delivery service
- [ ] Discovery endpoint

### Week 3
- [ ] Integration with Quorum (multisig proposals via A2A)
- [ ] Python SDK
- [ ] Demo: Two agents coordinate a multisig

---

## What This Unlocks

1. **Agent-to-Agent Multisig** - Agents coordinate directly, no human middleman
2. **Agent Services Marketplace** - Agent A hires Agent B for a task
3. **Agent DAOs** - Agents propose and vote
4. **Cross-Provider Coordination** - AgentKit ↔ aibtc ↔ OpenClaw

---

## Open Questions

1. **Registry decentralization** - Start centralized, move to ENS/on-chain?
2. **Spam prevention** - Rate limits? Staking? Reputation?
3. **Message encryption** - XMTP handles E2E, but agent keys vs wallet keys?
4. **Offline handling** - How long do messages persist?

---

## Why XMTP

| Feature | XMTP | Build Our Own |
|---------|------|---------------|
| Transport | ✅ Done | Months of work |
| Encryption | ✅ E2E built-in | Complex |
| Identity | ✅ Wallet addresses | Need to design |
| Decentralized | ✅ Yes | Hard |
| SDKs | ✅ TypeScript, React | Build from scratch |
| Production | ✅ Coinbase uses it | Unproven |

**Bottom line:** XMTP handles the hard parts. We build the agent-native layer.

---

## Name Ideas

- **Quorum Messenger** (ties to existing brand)
- **AgentLink**
- **A2A Protocol**
- **Swarm** (agents swarming)
- **Hive** (agent hive mind)
- **Nexus** (agent connection point)
