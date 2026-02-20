/**
 * Multisig routes
 * 
 * POST   /multisigs          - Create a new multisig
 * GET    /multisigs          - List all multisigs
 * GET    /multisigs/:id      - Get multisig details (with balance)
 * GET    /multisigs/:id/utxos - Get UTXOs for multisig
 * GET    /multisigs/:id/proposals - List proposals for multisig
 */

import { Hono } from 'hono';
import { z } from 'zod';
import type { 
  Multisig, 
  Agent,
  ApiResponse,
  ChainId,
  WalletProvider,
} from '../types';
import { createP2TRMultisig, compressedToXOnly } from '../services/taproot';
import { getBalance, getUtxos, p2trScriptPubkey } from '../services/bitcoin';
import { isEVMChain, predictSafeAddress } from '../adapters/evm-safe';
import repo from '../db/repository';

// Chain type detection
function isBitcoinChain(chainId: string): boolean {
  return chainId.startsWith('bitcoin-');
}

const router = new Hono();

// ═══════════════════════════════════════════════════════════════════
//                          VALIDATION
// ═══════════════════════════════════════════════════════════════════

const AgentInputSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(256).optional(), // Optional, derived from id if not provided
  publicKey: z.string().min(64).max(66),
  provider: z.enum(['aibtc', 'agentkit', 'crossmint', 'clawcash', 'bankr', 'custom']),
  webhookUrl: z.string().url().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const CreateMultisigSchema = z.object({
  name: z.string().min(1).max(256),
  chainId: z.enum([
    // Bitcoin
    'bitcoin-mainnet',
    'bitcoin-testnet', 
    'bitcoin-signet',
    // EVM (Safe)
    'ethereum',
    'base',
    'arbitrum',
    // Solana (coming soon)
    // 'solana-mainnet',
    // 'solana-devnet',
  ]),
  agents: z.array(AgentInputSchema).min(2).max(20),
  threshold: z.number().int().min(2).max(20),
}).refine(
  (data) => data.threshold <= data.agents.length,
  { message: 'Threshold cannot exceed number of agents' }
);

// ═══════════════════════════════════════════════════════════════════
//                            ROUTES
// ═══════════════════════════════════════════════════════════════════

/**
 * Create a new multisig
 */
router.post('/', async (c) => {
  // Parse and validate input
  const body = await c.req.json();
  const parseResult = CreateMultisigSchema.safeParse(body);
  
  if (!parseResult.success) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid input',
        details: parseResult.error.issues,
      },
    }, 400);
  }
  
  const input = parseResult.data;
  
  try {
    // Register/update agents
    const agentRecords: Agent[] = [];
    for (const agentInput of input.agents) {
      // For Bitcoin we convert to x-only, for EVM we keep as-is
      const xOnlyPubkey = isBitcoinChain(input.chainId) 
        ? compressedToXOnly(agentInput.publicKey)
        : undefined;
      
      // Check if agent exists
      let agent = await repo.getAgent(agentInput.id);
      if (!agent) {
        agent = {
          id: agentInput.id,
          name: agentInput.name,
          publicKey: agentInput.publicKey,
          xOnlyPubkey,
          provider: agentInput.provider as WalletProvider,
          webhookUrl: agentInput.webhookUrl,
          metadata: agentInput.metadata,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        await repo.createAgent(agent);
      }
      agentRecords.push(agent);
    }
    
    // Sort agents by pubkey for deterministic address
    const sortedAgents = [...agentRecords].sort((a, b) => {
      const pkA = a.xOnlyPubkey || a.publicKey;
      const pkB = b.xOnlyPubkey || b.publicKey;
      return pkA.toLowerCase().localeCompare(pkB.toLowerCase());
    });
    
    let multisig: Multisig;
    const multisigId = crypto.randomUUID();
    const agentList = sortedAgents.map(a => ({ ...a }));
    
    // ═══════════════════════════════════════════════════════════════
    //                    BITCOIN (Taproot)
    // ═══════════════════════════════════════════════════════════════
    if (isBitcoinChain(input.chainId)) {
      // Get x-only pubkeys
      const xOnlyPubkeys = sortedAgents.map(a => a.xOnlyPubkey || compressedToXOnly(a.publicKey));
      
      // Create P2TR multisig
      const p2tr = createP2TRMultisig(
        xOnlyPubkeys,
        input.threshold,
        input.chainId as ChainId
      );
      
      // Update agents with x-only pubkeys
      agentList.forEach((a, i) => { a.xOnlyPubkey = xOnlyPubkeys[i]; });
      
      // Update leaves with agent IDs
      const scriptTree = {
        ...p2tr.scriptTree,
        leaves: p2tr.scriptTree.leaves.map(leaf => ({
          ...leaf,
          signerAgentIds: leaf.signerPubkeys.map(pk => {
            const agent = agentList.find(a => a.xOnlyPubkey === pk);
            return agent?.id || '';
          }),
        })),
      };
      
      multisig = {
        id: multisigId,
        name: input.name,
        chainId: input.chainId as ChainId,
        address: p2tr.address,
        threshold: input.threshold,
        agents: agentList,
        bitcoin: {
          internalPubkey: p2tr.internalPubkey,
          scriptTree,
          merkleRoot: p2tr.scriptTree.root,
          tweakedPubkey: p2tr.tweakedPubkey,
        },
        createdAt: new Date(),
        createdBy: sortedAgents[0].id,
      };
    }
    // ═══════════════════════════════════════════════════════════════
    //                    EVM (Safe / Gnosis Safe)
    // ═══════════════════════════════════════════════════════════════
    else if (isEVMChain(input.chainId as ChainId)) {
      // For EVM, publicKey should be an Ethereum address (0x...)
      const owners = sortedAgents.map(a => {
        // If pubkey starts with 0x and is 42 chars, it's already an address
        if (a.publicKey.startsWith('0x') && a.publicKey.length === 42) {
          return a.publicKey as `0x${string}`;
        }
        // Otherwise it might be a compressed/uncompressed pubkey - derive address
        // For now, require addresses directly
        throw new Error(`Agent ${a.id}: EVM requires Ethereum address (0x...) as publicKey`);
      });
      
      // Predict Safe address (deterministic via CREATE2)
      const safeAddress = predictSafeAddress(
        { owners, threshold: input.threshold },
        input.chainId as ChainId
      );
      
      multisig = {
        id: multisigId,
        name: input.name,
        chainId: input.chainId as ChainId,
        address: safeAddress,
        threshold: input.threshold,
        agents: agentList,
        evm: {
          owners,
          safeVersion: '1.3.0',
          isDeployed: false, // Safe needs to be deployed on first tx
        },
        createdAt: new Date(),
        createdBy: sortedAgents[0].id,
      };
    }
    // ═══════════════════════════════════════════════════════════════
    //                    UNSUPPORTED CHAIN
    // ═══════════════════════════════════════════════════════════════
    else {
      return c.json<ApiResponse<never>>({
        success: false,
        error: {
          code: 'UNSUPPORTED_CHAIN',
          message: `Chain ${input.chainId} not yet supported`,
        },
      }, 400);
    }
    
    // Store with agent positions
    const agentPositions = sortedAgents.map((a, i) => ({
      agentId: a.id,
      position: i,
    }));
    await repo.createMultisig(multisig, agentPositions);
    
    return c.json<ApiResponse<Multisig>>({
      success: true,
      data: multisig,
    }, 201);
    
  } catch (error) {
    console.error('Error creating multisig:', error);
    return c.json<ApiResponse<never>>({
      success: false,
      error: {
        code: 'CREATION_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    }, 500);
  }
});

/**
 * Get multisig details
 */
router.get('/:id', async (c) => {
  const id = c.req.param('id');
  
  const multisig = await repo.getMultisig(id);
  if (!multisig) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: `Multisig not found: ${id}`,
      },
    }, 404);
  }
  
  // Fetch balance
  let balance = { confirmed: 0n, unconfirmed: 0n, total: 0n };
  try {
    balance = await getBalance(multisig.address, multisig.chainId);
  } catch (error) {
    console.warn('Could not fetch balance:', error);
  }
  
  return c.json<ApiResponse<Multisig & { balance: typeof balance }>>({
    success: true,
    data: {
      ...multisig,
      balance: {
        confirmed: balance.confirmed.toString(),
        unconfirmed: balance.unconfirmed.toString(),
        total: balance.total.toString(),
      } as any,
    },
  });
});

/**
 * Get UTXOs for multisig
 */
router.get('/:id/utxos', async (c) => {
  const id = c.req.param('id');
  
  const multisig = await repo.getMultisig(id);
  if (!multisig) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: `Multisig not found: ${id}`,
      },
    }, 404);
  }
  
  try {
    const utxos = await getUtxos(multisig.address, multisig.chainId);
    
    // Add scriptPubkey
    const scriptPubkey = multisig.bitcoin 
      ? p2trScriptPubkey(multisig.bitcoin.tweakedPubkey)
      : '';
    
    const enrichedUtxos = utxos.map(u => ({
      ...u,
      amount: u.amount.toString(),
      scriptPubkey,
    }));
    
    return c.json<ApiResponse<typeof enrichedUtxos>>({
      success: true,
      data: enrichedUtxos,
    });
  } catch (error) {
    console.error('Error fetching UTXOs:', error);
    return c.json<ApiResponse<never>>({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    }, 500);
  }
});

/**
 * List proposals for multisig
 */
router.get('/:id/proposals', async (c) => {
  const id = c.req.param('id');
  const status = c.req.query('status');
  
  const multisig = await repo.getMultisig(id);
  if (!multisig) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: `Multisig not found: ${id}`,
      },
    }, 404);
  }
  
  const proposals = await repo.getProposalsForMultisig(id);
  
  return c.json<ApiResponse<any[]>>({
    success: true,
    data: proposals.map(p => ({
      id: p.id,
      status: p.status,
      outputs: p.outputs,
      createdAt: p.createdAt,
      expiresAt: p.expiresAt,
      signatureCount: p.signatures.length,
      requiredSigners: p.requiredSigners.length,
    })),
  });
});

/**
 * List all multisigs
 */
router.get('/', async (c) => {
  const all = await repo.listMultisigs();
  
  return c.json<ApiResponse<Multisig[]>>({
    success: true,
    data: all,
  });
});

export default router;
