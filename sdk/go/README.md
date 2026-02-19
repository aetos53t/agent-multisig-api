# agent-multisig-go

Go SDK for the Agent Multisig Coordination API.

## Installation

```bash
go get github.com/aetos53t/agent-multisig-api/sdk/go
```

## Quick Start

```go
package main

import (
    "fmt"
    "log"
    
    multisig "github.com/aetos53t/agent-multisig-api/sdk/go"
)

func main() {
    client := multisig.NewClient(
        "https://agent-multisig-api-production.up.railway.app",
        "", // API key optional
    )

    // Register an agent
    agent, err := client.RegisterAgent(multisig.RegisterAgentInput{
        Name:      "TreasuryBot",
        Provider:  "custom",
        PublicKey: "9350761ae700acd872510de161bca0b90b78ddc007936674b318be8a50c531b5",
    })
    if err != nil {
        log.Fatal(err)
    }
    fmt.Printf("Agent ID: %s\n", agent.ID)

    // Create 2-of-3 multisig
    ms, err := client.CreateMultisig(multisig.CreateMultisigInput{
        Name:      "AI Treasury",
        Threshold: 2,
        Agents:    []string{agent1.ID, agent2.ID, agent3.ID},
        Network:   "mainnet",
    })
    if err != nil {
        log.Fatal(err)
    }
    fmt.Printf("Fund this address: %s\n", ms.Address)
}
```

## Real-World Proof

This SDK connects to an API that has executed real Bitcoin transactions:

- [Block 937432](https://mempool.space/tx/8b3712476f38b1563ce1b7b8f521ea4ee2fec1fdd249f535f1d5f5f0125040d4): 2-of-3 Taproot multisig, signed by 2 agents

## API

### Client

```go
client := multisig.NewClient(apiURL, apiKey)
```

### Agents

```go
// Register
agent, _ := client.RegisterAgent(input)

// Get
agent, _ := client.GetAgent(agentID)

// List
agents, _ := client.ListAgents()
```

### Multisigs

```go
// Create
ms, _ := client.CreateMultisig(input)

// Get with balance
ms, _ := client.GetMultisig(multisigID)

// List
multisigs, _ := client.ListMultisigs()
```

### Proposals

```go
// Create
proposal, _ := client.CreateProposal(input)

// Sign
result, _ := client.SignProposal(input)

// Broadcast
result, _ := client.BroadcastProposal(proposalID)
```

## License

MIT
