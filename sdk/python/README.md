# agent-multisig

Python SDK for the Agent Multisig Coordination API.

Enables AI agents to participate in multi-signature Bitcoin transactions.

## Installation

```bash
pip install agent-multisig
```

## Quick Start

```python
from agent_multisig import AgentMultisig

client = AgentMultisig(
    api_url='https://agent-multisig-api-production.up.railway.app',
    api_key='your-api-key'  # optional
)

# Quick setup: register agents and create multisig in one call
result = client.quick_setup(
    name='AI Treasury',
    threshold=2,
    signers=[
        {'name': 'TreasuryBot', 'provider': 'aibtc', 'public_key': '...'},
        {'name': 'AuditBot', 'provider': 'aibtc', 'public_key': '...'},
        {'name': 'BackupBot', 'provider': 'aibtc', 'public_key': '...'},
    ],
    network='mainnet'
)

multisig = result['multisig']
agents = result['agents']

print(f"Fund this address: {multisig['address']}")
# => bc1p6f4vmxvwnpgrgmmc4653u28jxlrf3enh0qwcev6safpcfy4y8gdqfcnjf6
```

## Creating a Spend Proposal

```python
# Create a proposal to spend from the multisig
proposal = client.create_proposal(
    multisig_id=multisig['id'],
    to='bc1qpzlw29z50cz7ysjpsaqggtscya3p6ggehnsp2g',
    amount=10000  # satoshis
)

print(f"PSBT to sign: {proposal['psbt_hex']}")
```

## Signing

```python
# Each agent signs the proposal
client.sign_proposal(
    proposal_id=proposal['id'],
    agent_id=agents[0]['id'],
    signature='schnorr_signature_hex...'
)

client.sign_proposal(
    proposal_id=proposal['id'],
    agent_id=agents[1]['id'],
    signature='schnorr_signature_hex...'
)

# Once threshold is met, broadcast
result = client.broadcast_proposal(proposal['id'])
print(f"Transaction broadcast: {result['txid']}")
```

## Waiting for Confirmation

```python
# Wait for the proposal to be confirmed on-chain
confirmed = client.wait_for_proposal(
    proposal_id=proposal['id'],
    target_status='confirmed',
    timeout_ms=600000,  # 10 minutes
    poll_interval_ms=10000  # check every 10 seconds
)

print(f"Confirmed in txid: {confirmed['txid']}")
```

## Real-World Proof

This SDK was used to execute a real 2-of-3 multisig transaction on Bitcoin mainnet:

| Transaction | Link |
|-------------|------|
| Funding | [3222492b...](https://mempool.space/tx/3222492b560eb8b6898746ea11f3b4eed1dbf5fff21df75b581eea701edd0222) |
| Spend | [8b371247...](https://mempool.space/tx/8b3712476f38b1563ce1b7b8f521ea4ee2fec1fdd249f535f1d5f5f0125040d4) |

20,000 sats → 2-of-3 Taproot multisig → Signed by 2 agents → Confirmed in block 937432.

## API Reference

### `AgentMultisig(api_url, api_key=None, timeout=30)`

Create a new client instance.

### Agents

- `register_agent(name, provider, public_key, chain='bitcoin', webhook_url=None)` - Register agent
- `get_agent(agent_id)` - Get agent by ID
- `list_agents()` - List all agents

### Multisigs

- `create_multisig(name, threshold, agents, network='mainnet')` - Create multisig
- `get_multisig(multisig_id)` - Get multisig by ID
- `list_multisigs()` - List all multisigs
- `get_multisig_balance(multisig_id)` - Get balance and UTXOs

### Proposals

- `create_proposal(multisig_id, to, amount)` - Create spend proposal
- `get_proposal(proposal_id)` - Get proposal by ID
- `list_proposals(multisig_id=None)` - List proposals
- `sign_proposal(proposal_id, agent_id, signature)` - Submit signature
- `broadcast_proposal(proposal_id)` - Broadcast when ready

### Convenience

- `quick_setup(name, threshold, signers)` - Register agents + create multisig
- `wait_for_proposal(proposal_id, target_status)` - Poll until status reached

## License

MIT
