import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";

const API_URL = process.env.QUORUM_API_URL || "https://quorumclaw.com";

// Tool definitions
const tools: Tool[] = [
  {
    name: "multisig_create_invite",
    description: "Create a new multisig wallet and get an invite link to share with other signers",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Name for the multisig (e.g., 'Treasury Bot Squad')"
        },
        chainId: {
          type: "string",
          enum: ["bitcoin-mainnet", "bitcoin-testnet", "ethereum", "base", "solana-mainnet"],
          description: "Which blockchain to create the multisig on"
        },
        threshold: {
          type: "number",
          description: "Number of signatures required (e.g., 2 for 2-of-3)"
        },
        totalSigners: {
          type: "number",
          description: "Total number of signers (e.g., 3 for 2-of-3)"
        }
      },
      required: ["name", "chainId", "threshold", "totalSigners"]
    }
  },
  {
    name: "multisig_join_invite",
    description: "Join a multisig wallet using an invite code",
    inputSchema: {
      type: "object",
      properties: {
        inviteCode: {
          type: "string",
          description: "The invite code (e.g., 'a1b2c3d4')"
        },
        name: {
          type: "string",
          description: "Your display name as a signer"
        },
        publicKey: {
          type: "string",
          description: "Your public key (hex). For Bitcoin: 32-byte x-only pubkey."
        },
        webhookUrl: {
          type: "string",
          description: "Optional: URL to receive signing notifications"
        }
      },
      required: ["inviteCode", "name", "publicKey"]
    }
  },
  {
    name: "multisig_check_balance",
    description: "Check the balance of a multisig wallet",
    inputSchema: {
      type: "object",
      properties: {
        multisigId: {
          type: "string",
          description: "The multisig wallet ID"
        }
      },
      required: ["multisigId"]
    }
  },
  {
    name: "multisig_register",
    description: "Register your agent with the coordination API. Returns your agent ID.",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Display name for your agent"
        },
        publicKey: {
          type: "string",
          description: "Your public key (hex). For Bitcoin: 32-byte x-only. For EVM: 20-byte address."
        },
        provider: {
          type: "string",
          enum: ["aibtc", "clawcash", "bankr", "custom"],
          description: "Your wallet provider"
        },
        webhookUrl: {
          type: "string",
          description: "Optional: URL to receive signing notifications"
        }
      },
      required: ["name", "publicKey", "provider"]
    }
  },
  {
    name: "multisig_status",
    description: "Check your registration status and pending proposals",
    inputSchema: {
      type: "object",
      properties: {
        agentId: {
          type: "string",
          description: "Your agent ID (from registration)"
        }
      },
      required: ["agentId"]
    }
  },
  {
    name: "multisig_list_proposals",
    description: "List proposals awaiting your signature",
    inputSchema: {
      type: "object",
      properties: {
        agentId: {
          type: "string",
          description: "Your agent ID"
        },
        status: {
          type: "string",
          enum: ["pending", "signed", "all"],
          description: "Filter by status (default: pending)"
        }
      },
      required: ["agentId"]
    }
  },
  {
    name: "multisig_get_signing_payload",
    description: "Get the digest/data you need to sign for a proposal",
    inputSchema: {
      type: "object",
      properties: {
        proposalId: {
          type: "string",
          description: "The proposal ID"
        },
        agentId: {
          type: "string",
          description: "Your agent ID"
        }
      },
      required: ["proposalId", "agentId"]
    }
  },
  {
    name: "multisig_submit_signature",
    description: "Submit your signature for a proposal",
    inputSchema: {
      type: "object",
      properties: {
        proposalId: {
          type: "string",
          description: "The proposal ID"
        },
        agentId: {
          type: "string",
          description: "Your agent ID"
        },
        signature: {
          type: "string",
          description: "Your signature (hex). For Bitcoin: 64-byte Schnorr. For EVM: 65-byte ECDSA."
        }
      },
      required: ["proposalId", "agentId", "signature"]
    }
  },
  {
    name: "multisig_list_wallets",
    description: "List multisig wallets you're a member of",
    inputSchema: {
      type: "object",
      properties: {
        agentId: {
          type: "string",
          description: "Your agent ID"
        }
      },
      required: ["agentId"]
    }
  },
  {
    name: "multisig_create_proposal",
    description: "Create a new spending proposal for a multisig wallet",
    inputSchema: {
      type: "object",
      properties: {
        multisigId: {
          type: "string",
          description: "The multisig wallet ID"
        },
        outputs: {
          type: "array",
          description: "Array of {address, amount} outputs",
          items: {
            type: "object",
            properties: {
              address: { type: "string" },
              amount: { type: "string" }
            },
            required: ["address", "amount"]
          }
        },
        note: {
          type: "string",
          description: "Optional note explaining the transaction"
        }
      },
      required: ["multisigId", "outputs"]
    }
  }
];

// API helper
async function apiCall(method: string, path: string, body?: any): Promise<any> {
  const url = `${API_URL}${path}`;
  const options: RequestInit = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || data.error || `API error: ${response.status}`);
  }

  return data;
}

// Tool handlers
async function handleTool(name: string, args: any): Promise<any> {
  switch (name) {
    case "multisig_create_invite": {
      const result = await apiCall("POST", "/v1/invites", {
        name: args.name,
        chainId: args.chainId,
        threshold: args.threshold,
        totalSigners: args.totalSigners,
      });
      const inviteId = result.data?.inviteId || result.data?.id || result.inviteId;
      return {
        success: true,
        inviteCode: inviteId,
        inviteUrl: `${API_URL}/join/${inviteId}`,
        threshold: args.threshold,
        totalSigners: args.totalSigners,
        message: `Created ${args.threshold}-of-${args.totalSigners} multisig. Share this link: ${API_URL}/join/${inviteId}`
      };
    }

    case "multisig_join_invite": {
      const result = await apiCall("POST", `/v1/invites/${args.inviteCode}/join`, {
        name: args.name,
        publicKey: args.publicKey,
        webhookUrl: args.webhookUrl,
      });
      
      const data = result.data || result;
      const filledSlots = data.slots?.filter((s: any) => s.publicKey).length || 0;
      const totalSlots = data.slots?.length || 0;
      
      return {
        success: true,
        multisigName: data.name,
        slotsJoined: `${filledSlots}/${totalSlots}`,
        address: data.address || null,
        multisigId: data.multisigId || null,
        message: data.address 
          ? `Joined! Multisig is ready. Address: ${data.address}`
          : `Joined! Waiting for ${totalSlots - filledSlots} more signer(s).`
      };
    }

    case "multisig_check_balance": {
      const result = await apiCall("GET", `/v1/multisigs/${args.multisigId}`);
      const data = result.data || result;
      const balance = data.balance || {};
      
      return {
        success: true,
        address: data.address,
        confirmed: balance.confirmed || "0",
        unconfirmed: balance.unconfirmed || "0",
        total: balance.total || "0",
        message: balance.total && parseInt(balance.total) > 0
          ? `Balance: ${balance.total} sats (${balance.confirmed} confirmed)`
          : "No funds yet. Send funds to the address above."
      };
    }

    case "multisig_register": {
      const result = await apiCall("POST", "/v1/agents", {
        name: args.name,
        publicKey: args.publicKey,
        provider: args.provider,
        webhookUrl: args.webhookUrl,
      });
      return {
        success: true,
        agentId: result.data?.id || result.id,
        message: `Registered as ${result.data?.id || result.id}. Save this ID for future calls.`
      };
    }

    case "multisig_status": {
      const agent = await apiCall("GET", `/v1/agents/${args.agentId}`);
      const proposals = await apiCall("GET", `/v1/proposals?agentId=${args.agentId}&status=pending`);
      return {
        success: true,
        agent: agent.data || agent,
        pendingProposals: proposals.data?.length || 0,
        message: proposals.data?.length > 0 
          ? `You have ${proposals.data.length} proposal(s) awaiting signature`
          : "No pending proposals"
      };
    }

    case "multisig_list_proposals": {
      const status = args.status === "all" ? "" : `&status=${args.status || "pending"}`;
      const result = await apiCall("GET", `/v1/proposals?agentId=${args.agentId}${status}`);
      return {
        success: true,
        proposals: result.data || [],
        count: result.data?.length || 0
      };
    }

    case "multisig_get_signing_payload": {
      const result = await apiCall("GET", `/v1/proposals/${args.proposalId}/payload/${args.agentId}`);
      return {
        success: true,
        proposalId: args.proposalId,
        digest: result.data?.digest || result.digest,
        message: result.data?.message || "Sign this digest with your private key",
        raw: result.data?.raw || result.raw
      };
    }

    case "multisig_submit_signature": {
      const result = await apiCall("POST", `/v1/proposals/${args.proposalId}/sign`, {
        agentId: args.agentId,
        signature: args.signature
      });
      const sigCount = result.data?.signatureCount || result.signatureCount;
      const threshold = result.data?.threshold || result.threshold;
      return {
        success: true,
        signatureCount: sigCount,
        threshold: threshold,
        thresholdReached: sigCount >= threshold,
        message: sigCount >= threshold 
          ? "Threshold reached! Proposal ready for finalization."
          : `Signature submitted. ${sigCount}/${threshold} collected.`
      };
    }

    case "multisig_list_wallets": {
      const result = await apiCall("GET", `/v1/multisigs?agentId=${args.agentId}`);
      return {
        success: true,
        wallets: result.data || [],
        count: result.data?.length || 0
      };
    }

    case "multisig_create_proposal": {
      const result = await apiCall("POST", "/v1/proposals", {
        multisigId: args.multisigId,
        outputs: args.outputs,
        note: args.note
      });
      return {
        success: true,
        proposalId: result.data?.id || result.id,
        status: result.data?.status || "pending",
        message: `Proposal created: ${result.data?.id || result.id}`
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// Create and run server
const server = new Server(
  {
    name: "multisig-mcp",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    const result = await handleTool(name, args || {});
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error: any) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: false,
            error: error.message,
          }),
        },
      ],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Multisig MCP server running on stdio");
}

main().catch(console.error);
