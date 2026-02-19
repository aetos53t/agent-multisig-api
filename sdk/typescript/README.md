# @agent-multisig/sdk

TypeScript SDK for the Agent Multisig Coordination API.

Enables AI agents to participate in multi-signature Bitcoin transactions.

## Installation

```bash
npm install @agent-multisig/sdk
```

## Quick Start

```typescript
import { AgentMultisig } from '@agent-multisig/sdk';

const client = new AgentMultisig({
  apiUrl: 'https://agent-multisig-api-production.up.railway.app',
  apiKey: 'your-api-key'  // optional
});

// Quick setup: register agents and create multisig in one call
const { multisig, agents } = await client.quickSetup({
  name: 'AI Treasury',
  threshold: 2,
  signers: [
    { name: 'TreasuryBot', provider: 'aibtc', publicKey: '...' },
    { name: 'AuditBot', provider: 'aibtc', publicKey: '...' },
    { name: 'BackupBot', provider: 'aibtc', publicKey: '...' },
  ],
  network: 'mainnet'
});

console.log('Fund this address:', multisig.address);
// => bc1p6f4vmxvwnpgrgmmc4653u28jxlrf3enh0qwcev6safpcfy4y8gdqfcnjf6
```

## Creating a Spend Proposal

```typescript
// Create a proposal to spend from the multisig
const proposal = await client.createProposal({
  multisigId: multisig.id,
  to: 'bc1qpzlw29z50cz7ysjpsaqggtscya3p6ggehnsp2g',
  amount: 10000  // satoshis
});

console.log('PSBT to sign:', proposal.psbtHex);
```

## Signing

```typescript
// Each agent signs the proposal
await client.signProposal({
  proposalId: proposal.id,
  agentId: agents[0].id,
  signature: 'schnorr_signature_hex...'
});

await client.signProposal({
  proposalId: proposal.id,
  agentId: agents[1].id,
  signature: 'schnorr_signature_hex...'
});

// Once threshold is met, broadcast
const { txid } = await client.broadcastProposal(proposal.id);
console.log('Transaction broadcast:', txid);
```

## Waiting for Confirmation

```typescript
// Wait for the proposal to be confirmed on-chain
const confirmed = await client.waitForProposal(proposal.id, 'confirmed', {
  timeoutMs: 600000,  // 10 minutes
  pollIntervalMs: 10000  // check every 10 seconds
});

console.log('Confirmed in txid:', confirmed.txid);
```

## Real-World Example

This SDK was used to execute a real 2-of-3 multisig transaction on Bitcoin mainnet:

**Funding TX:** [3222492b...](https://mempool.space/tx/3222492b560eb8b6898746ea11f3b4eed1dbf5fff21df75b581eea701edd0222)  
**Spend TX:** [8b371247...](https://mempool.space/tx/8b3712476f38b1563ce1b7b8f521ea4ee2fec1fdd249f535f1d5f5f0125040d4)

20,000 sats → 2-of-3 Taproot multisig → Signed by 2 agents → Confirmed in block 937432.

## API Reference

### `new AgentMultisig(config)`

Create a new client instance.

| Option | Type | Description |
|--------|------|-------------|
| `apiUrl` | `string` | API base URL |
| `apiKey` | `string?` | Optional API key |
| `timeout` | `number?` | Request timeout in ms (default: 30000) |

### Agents

- `registerAgent(input)` - Register a new agent
- `getAgent(agentId)` - Get agent by ID
- `listAgents()` - List all agents

### Multisigs

- `createMultisig(input)` - Create a new multisig
- `getMultisig(multisigId)` - Get multisig by ID
- `listMultisigs()` - List all multisigs
- `getMultisigBalance(multisigId)` - Get balance and UTXOs

### Proposals

- `createProposal(input)` - Create a spend proposal
- `getProposal(proposalId)` - Get proposal by ID
- `listProposals(multisigId?)` - List proposals
- `signProposal(input)` - Submit a signature
- `broadcastProposal(proposalId)` - Broadcast when ready

### Convenience

- `quickSetup(input)` - Register agents + create multisig in one call
- `waitForProposal(id, status, options)` - Poll until status reached

## License

MIT
