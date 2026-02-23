/**
 * Proposal routes
 * 
 * POST   /proposals              - Create a new proposal
 * GET    /proposals              - List all proposals
 * GET    /proposals/:id          - Get proposal details
 * GET    /proposals/:id/payload/:agentId - Get signing payload for agent
 * POST   /proposals/:id/sign     - Submit a signature
 * POST   /proposals/:id/finalize - Finalize when threshold met
 * POST   /proposals/:id/broadcast - Broadcast to network
 * POST   /proposals/:id/reject   - Reject a proposal
 */

import { Hono } from 'hono';
import { z } from 'zod';
import type { 
  Proposal, 
  SigningPayload,
  ApiResponse,
  TxOutput,
} from '../types';
import { createPSBT, addSignatureToPSBT, finalizePSBT, inspectPSBT } from '../services/psbt';
import { getConfirmedUtxos, getAllUtxos, getFeeRate, broadcastTransaction, p2trScriptPubkey } from '../services/bitcoin';
import { compressedToXOnly } from '../services/taproot';
import repo from '../db/repository';
import webhooks from '../services/webhooks';
import { onSignatureAdded, onProposalStatusChanged, onProposalCreated } from '../services/rooms';

const router = new Hono();

// ═══════════════════════════════════════════════════════════════════
//                          VALIDATION
// ═══════════════════════════════════════════════════════════════════

const TxOutputSchema = z.object({
  address: z.string().min(1),
  amount: z.union([z.string(), z.number()]).transform(val => 
    typeof val === 'string' ? val : val.toString()
  ),
  label: z.string().optional(),
});

const CreateProposalSchema = z.object({
  multisigId: z.string().uuid(),
  outputs: z.array(TxOutputSchema).min(1).max(100),
  feeRate: z.number().int().min(1).max(10000).optional(),
  note: z.string().max(1000).optional(),
  expiresInSeconds: z.number().int().min(60).max(604800).optional(),
  allowUnconfirmed: z.boolean().optional(), // Allow mempool UTXOs (risky!)
  autoBroadcast: z.boolean().optional(), // Auto-broadcast after threshold met
});

const SignProposalSchema = z.object({
  agentId: z.string().min(1).max(64),
  signature: z.string().length(128),
});

const RejectProposalSchema = z.object({
  agentId: z.string().min(1).max(64),
  reason: z.string().max(500).optional(),
});

// ═══════════════════════════════════════════════════════════════════
//                        AUTO-BROADCAST TRACKING
// ═══════════════════════════════════════════════════════════════════

// Track proposals that should auto-broadcast after finalization
const autoBroadcastProposals = new Map<string, boolean>();

// ═══════════════════════════════════════════════════════════════════
//                            ROUTES
// ═══════════════════════════════════════════════════════════════════

/**
 * Create a new proposal
 */
router.post('/', async (c) => {
  const body = await c.req.json();
  const parseResult = CreateProposalSchema.safeParse(body);
  
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
  
  // Get multisig
  const multisig = await repo.getMultisig(input.multisigId);
  if (!multisig) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: `Multisig not found: ${input.multisigId}`,
      },
    }, 404);
  }
  
  if (!multisig.chainId.startsWith('bitcoin-')) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: {
        code: 'INVALID_MULTISIG',
        message: 'Multisig is not a Bitcoin multisig',
      },
    }, 400);
  }
  
  try {
    // Get UTXOs (optionally include unconfirmed)
    const utxos = input.allowUnconfirmed
      ? await getAllUtxos(multisig.address, multisig.chainId)
      : await getConfirmedUtxos(multisig.address, multisig.chainId);
    
    if (utxos.length === 0) {
      return c.json<ApiResponse<never>>({
        success: false,
        error: {
          code: 'NO_UTXOS',
          message: input.allowUnconfirmed 
            ? 'No UTXOs available' 
            : 'No confirmed UTXOs available (try allowUnconfirmed: true)',
        },
      }, 400);
    }
    
    // Add scriptPubkey to UTXOs
    const scriptPubkey = p2trScriptPubkey(multisig.tweakedPubkey);
    const enrichedUtxos = utxos.map(u => ({ ...u, scriptPubkey }));
    
    // Get fee rate
    const feeRate = input.feeRate || await getFeeRate(multisig.chainId, 'medium');
    
    // Convert outputs
    const outputs: TxOutput[] = input.outputs.map(o => ({
      address: o.address,
      amount: BigInt(o.amount),
      label: o.label,
    }));
    
    // Select leaf (use first one for now)
    const selectedLeafIndex = 0;
    const selectedLeaf = multisig.scriptTree.leaves[selectedLeafIndex];
    
    // Create PSBT
    const psbtResult = createPSBT({
      inputs: enrichedUtxos,
      outputs,
      feeRate,
      changeAddress: multisig.address,
      chainId: multisig.chainId,
      multisig: {
        address: multisig.address,
        internalPubkey: multisig.internalPubkey,
        tweakedPubkey: multisig.tweakedPubkey,
        scriptTree: multisig.scriptTree,
      },
      selectedLeafIndex,
    });
    
    // Create proposal
    const proposalId = crypto.randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + (input.expiresInSeconds || 86400) * 1000);
    
    // Convert BigInts to strings for JSON serialization
    const outputsForStorage = outputs.map(o => ({
      ...o,
      amount: o.amount.toString(),
    }));
    
    const proposal: Proposal = {
      id: proposalId,
      multisigId: input.multisigId,
      status: 'pending',
      outputs: outputsForStorage as any,
      feeRate,
      fee: Number(psbtResult.fee),
      inputs: enrichedUtxos,
      changeOutput: psbtResult.changeAmount > 0n ? {
        address: multisig.address,
        amount: psbtResult.changeAmount.toString(),
      } : undefined,
      selectedLeafIndex,
      requiredSigners: selectedLeaf.signerAgentIds,
      signatures: [],
      unsignedTx: psbtResult.psbt,
      note: input.note,
      createdAt: now,
      createdBy: selectedLeaf.signerAgentIds[0] || 'unknown',
      expiresAt,
    };
    
    await repo.createProposal(proposal);
    
    // Notify room of creation
    const creatorAgent = await repo.getAgent(proposal.createdBy);
    onProposalCreated(proposal.id, creatorAgent?.name || proposal.createdBy, input.note);
    
    // Track auto-broadcast preference
    if (input.autoBroadcast) {
      autoBroadcastProposals.set(proposal.id, true);
      console.log(`[Auto-Broadcast] Enabled for proposal ${proposal.id}`);
    }
    
    // Notify agents via webhooks (fire and forget)
    webhooks.notifyProposalCreated(proposal, multisig).catch(err => {
      console.error('Webhook delivery error:', err);
    });
    
    // Notify each required signer individually that their signature is needed
    const agents = await repo.getAgentsForMultisig(multisig.id);
    for (const signerAgentId of proposal.requiredSigners) {
      const signerAgent = agents.find(a => a.id === signerAgentId);
      if (signerAgent?.webhookUrl) {
        webhooks.notifySignatureNeeded(signerAgent, proposal, multisig).catch(err => {
          console.error(`Webhook error for ${signerAgentId}:`, err);
        });
      }
    }
    
    return c.json<ApiResponse<Proposal & { sighashes: typeof psbtResult.sighashes }>>({
      success: true,
      data: {
        ...proposal,
        fee: proposal.fee?.toString() as any,
        outputs: proposal.outputs.map(o => ({ ...o, amount: o.amount.toString() })) as any,
        changeOutput: proposal.changeOutput ? {
          ...proposal.changeOutput,
          amount: proposal.changeOutput.amount.toString(),
        } as any : undefined,
        inputs: proposal.inputs?.map(i => ({ ...i, amount: i.amount.toString() })) as any,
        sighashes: psbtResult.sighashes,
      },
    }, 201);
    
  } catch (error) {
    console.error('Error creating proposal:', error);
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
 * Get proposal details
 */
router.get('/:id', async (c) => {
  const id = c.req.param('id');
  
  const proposal = await repo.getProposal(id);
  if (!proposal) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: `Proposal not found: ${id}`,
      },
    }, 404);
  }
  
  // Check expiration
  if (proposal.status === 'pending' && new Date() > proposal.expiresAt) {
    await repo.updateProposalStatus(id, 'expired');
    proposal.status = 'expired';
  }
  
  const multisig = await repo.getMultisig(proposal.multisigId);
  
  return c.json<ApiResponse<any>>({
    success: true,
    data: {
      ...proposal,
      fee: proposal.fee?.toString(),
      outputs: proposal.outputs.map(o => ({ ...o, amount: o.amount.toString() })),
      changeOutput: proposal.changeOutput ? {
        ...proposal.changeOutput,
        amount: proposal.changeOutput.amount.toString(),
      } : undefined,
      inputs: proposal.inputs?.map(i => ({ ...i, amount: i.amount.toString() })),
      thresholdMet: proposal.signatures.length >= (multisig?.threshold || 2),
      remainingSigners: proposal.requiredSigners.filter(
        s => !proposal.signatures.find(sig => sig.agentId === s)
      ),
    },
  });
});

/**
 * Get signing payload for an agent
 */
router.get('/:id/payload/:agentId', async (c) => {
  const proposalId = c.req.param('id');
  const agentId = c.req.param('agentId');
  
  const proposal = await repo.getProposal(proposalId);
  if (!proposal) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: { code: 'NOT_FOUND', message: `Proposal not found: ${proposalId}` },
    }, 404);
  }
  
  if (!proposal.requiredSigners.includes(agentId)) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: { code: 'NOT_AUTHORIZED', message: `Agent ${agentId} is not a required signer` },
    }, 403);
  }
  
  if (proposal.signatures.find(s => s.agentId === agentId)) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: { code: 'ALREADY_SIGNED', message: `Agent ${agentId} has already signed` },
    }, 400);
  }
  
  const multisig = await repo.getMultisig(proposal.multisigId);
  if (!multisig?.bitcoin) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: { code: 'INVALID_MULTISIG', message: 'Multisig not found or invalid' },
    }, 400);
  }
  
  // Parse PSBT to get sighash
  const psbtInfo = inspectPSBT(proposal.unsignedTx);
  
  const totalInput = proposal.inputs?.reduce((sum, i) => sum + i.amount, 0n) || 0n;
  const totalOutput = proposal.outputs.reduce((sum, o) => sum + o.amount, 0n);
  
  const payload: SigningPayload = {
    proposalId,
    agentId,
    chainId: multisig.chainId,
    digest: psbtInfo.inputs[0]?.txid || '',
    message: `Send ${totalOutput.toString()} sats. Fee: ${proposal.fee?.toString()} sats.`,
    outputs: proposal.outputs,
    totalInput,
    totalOutput,
    fee: proposal.fee || 0n,
    raw: {
      bitcoin: {
        psbt: proposal.unsignedTx,
        inputIndex: 0,
        sighashType: 0,
      },
    },
  };
  
  return c.json<ApiResponse<any>>({
    success: true,
    data: {
      ...payload,
      totalInput: payload.totalInput.toString(),
      totalOutput: payload.totalOutput.toString(),
      fee: payload.fee.toString(),
      outputs: payload.outputs.map(o => ({ ...o, amount: o.amount.toString() })),
    },
  });
});

/**
 * Submit a signature
 */
router.post('/:id/sign', async (c) => {
  const proposalId = c.req.param('id');
  const body = await c.req.json();
  const parseResult = SignProposalSchema.safeParse(body);
  
  if (!parseResult.success) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: parseResult.error.issues },
    }, 400);
  }
  
  const { agentId, signature } = parseResult.data;
  
  const proposal = await repo.getProposal(proposalId);
  if (!proposal) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: { code: 'NOT_FOUND', message: `Proposal not found: ${proposalId}` },
    }, 404);
  }
  
  // Check if agent already signed (do this BEFORE status check)
  if (proposal.signatures.find(s => s.agentId === agentId)) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: { code: 'ALREADY_SIGNED', message: `Agent ${agentId} has already signed` },
    }, 400);
  }
  
  // Allow signing if agent hasn't signed yet, even if status is 'ready'
  // (handles edge case where status got set prematurely)
  if (proposal.status !== 'pending' && proposal.status !== 'ready') {
    return c.json<ApiResponse<never>>({
      success: false,
      error: { code: 'INVALID_STATUS', message: `Proposal is ${proposal.status}, cannot sign` },
    }, 400);
  }
  
  if (!proposal.requiredSigners.includes(agentId)) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: { code: 'NOT_AUTHORIZED', message: `Agent ${agentId} is not a required signer` },
    }, 403);
  }
  
  const multisig = await repo.getMultisig(proposal.multisigId);
  if (!multisig) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: { code: 'INVALID_MULTISIG', message: 'Multisig not found' },
    }, 400);
  }
  
  // Find agent's pubkey
  const agent = multisig.agents.find(a => a.id === agentId);
  if (!agent) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: { code: 'AGENT_NOT_FOUND', message: `Agent ${agentId} not in multisig` },
    }, 400);
  }
  
  // Add signature
  const sig = {
    agentId,
    publicKey: agent.xOnlyPubkey || compressedToXOnly(agent.publicKey),
    signature,
    signedAt: new Date(),
  };
  await repo.addSignature(proposalId, sig);
  
  // Notify room of signature
  const currentSigCount = (proposal.signatures?.length || 0) + 1;
  onSignatureAdded(proposalId, agentId, agent.name, currentSigCount, multisig.threshold);
  
  // Update PSBT with signature for ALL inputs (they all use the same script)
  let signedTx = proposal.signedTx || proposal.unsignedTx;
  const numInputs = proposal.inputs?.length || 1;
  
  try {
    for (let inputIndex = 0; inputIndex < numInputs; inputIndex++) {
      signedTx = addSignatureToPSBT({
        psbt: signedTx,
        inputIndex,
        signature,
        pubkey: agent.xOnlyPubkey || compressedToXOnly(agent.publicKey),
      });
    }
    await repo.updateProposalStatus(proposalId, proposal.status, { signedTx });
  } catch (error) {
    console.error('Error adding signature to PSBT:', error);
  }
  
  // Re-fetch proposal to get accurate state
  const updatedProposal = await repo.getProposal(proposalId);
  if (!updatedProposal) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch updated proposal' },
    }, 500);
  }
  
  // Count signatures properly - dedupe by agentId
  const uniqueSigners = new Set(updatedProposal.signatures.map(s => s.agentId));
  const sigCount = uniqueSigners.size;
  const thresholdMet = sigCount >= multisig.threshold;
  
  // Calculate remaining signers from the fresh data
  const signedAgentIds = new Set(updatedProposal.signatures.map(s => s.agentId));
  const remainingSigners = updatedProposal.requiredSigners.filter(s => !signedAgentIds.has(s));
  
  // Auto-finalize when threshold met
  let finalStatus = updatedProposal.status;
  let autoFinalized = false;
  let txid: string | undefined;
  let txHex: string | undefined;
  
  if (thresholdMet && updatedProposal.status === 'pending') {
    // Notify agents that threshold is reached
    webhooks.notifyThresholdReached(updatedProposal, multisig).catch(err => {
      console.error('Webhook delivery error:', err);
    });
    
    // Auto-finalize the transaction
    try {
      console.log(`[Auto-Finalize] Threshold met for proposal ${proposalId}, finalizing...`);
      
      const bitcoinData = {
        internalPubkey: multisig.internalPubkey,
        tweakedPubkey: multisig.tweakedPubkey,
        scriptTree: multisig.scriptTree,
      };
      const result = finalizePSBT(
        signedTx,
        bitcoinData,
        updatedProposal.selectedLeafIndex || 0
      );
      
      await repo.updateProposalStatus(proposalId, 'finalized', {
        signedTx,
        finalTx: result.txHex,
        txid: result.txid,
      });
      
      finalStatus = 'finalized';
      autoFinalized = true;
      txid = result.txid;
      txHex = result.txHex;
      
      console.log(`[Auto-Finalize] ✓ Proposal ${proposalId} finalized: ${txid}`);
      
      // Auto-broadcast if enabled
      if (autoBroadcastProposals.get(proposalId)) {
        try {
          console.log(`[Auto-Broadcast] Broadcasting ${proposalId}...`);
          const broadcastTxid = await broadcastTransaction(result.txHex, multisig.chainId);
          
          await repo.updateProposalStatus(proposalId, 'broadcast', { txid: broadcastTxid });
          finalStatus = 'broadcast';
          txid = broadcastTxid;
          
          // Notify room
          onProposalStatusChanged(proposalId, 'finalized', 'broadcast', broadcastTxid);
          
          console.log(`[Auto-Broadcast] ✓ Transaction broadcast: ${broadcastTxid}`);
          
          // Notify agents of broadcast
          webhooks.notifyBroadcast(updatedProposal, multisig, broadcastTxid).catch(err => {
            console.error('Webhook delivery error:', err);
          });
          
          // Clean up tracking
          autoBroadcastProposals.delete(proposalId);
        } catch (broadcastError) {
          console.error(`[Auto-Broadcast] Failed for ${proposalId}:`, broadcastError);
          // Still finalized, just not broadcast - user can manually broadcast
        }
      }
    } catch (error) {
      console.error(`[Auto-Finalize] Failed for ${proposalId}:`, error);
      // Fall back to just setting ready status
      await repo.updateProposalStatus(proposalId, 'ready', { signedTx });
      finalStatus = 'ready';
    }
  }
  
  // Notify remaining signers if not yet threshold
  if (!thresholdMet && remainingSigners.length > 0) {
    const agents = await repo.getAgentsForMultisig(multisig.id);
    for (const remainingId of remainingSigners) {
      const remainingAgent = agents.find(a => a.id === remainingId);
      if (remainingAgent?.webhookUrl) {
        webhooks.notifySignatureNeeded(remainingAgent, updatedProposal, multisig).catch(err => {
          console.error(`Webhook error for ${remainingId}:`, err);
        });
      }
    }
  }
  
  return c.json<ApiResponse<any>>({
    success: true,
    data: {
      proposalId,
      status: finalStatus,
      signatureCount: sigCount,
      threshold: multisig.threshold,
      thresholdMet,
      remainingSigners,
      autoFinalized,
      ...(txid && { txid }),
      ...(txHex && { txHex }),
    },
  });
});

/**
 * Finalize proposal
 */
router.post('/:id/finalize', async (c) => {
  const proposalId = c.req.param('id');
  
  const proposal = await repo.getProposal(proposalId);
  if (!proposal) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: { code: 'NOT_FOUND', message: `Proposal not found: ${proposalId}` },
    }, 404);
  }
  
  if (proposal.status !== 'ready') {
    return c.json<ApiResponse<never>>({
      success: false,
      error: { code: 'INVALID_STATUS', message: `Proposal is ${proposal.status}, need ready` },
    }, 400);
  }
  
  const multisig = await repo.getMultisig(proposal.multisigId);
  if (!multisig?.bitcoin) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: { code: 'INVALID_MULTISIG', message: 'Multisig not found' },
    }, 400);
  }
  
  try {
    const bitcoinData = {
      internalPubkey: multisig.internalPubkey,
      tweakedPubkey: multisig.tweakedPubkey,
      scriptTree: multisig.scriptTree,
    };
    const result = finalizePSBT(
      proposal.signedTx || proposal.unsignedTx,
      bitcoinData,
      proposal.selectedLeafIndex || 0
    );
    
    await repo.updateProposalStatus(proposalId, 'finalized', {
      finalTx: result.txHex,
      txid: result.txid,
    });
    
    return c.json<ApiResponse<any>>({
      success: true,
      data: {
        proposalId,
        status: 'finalized',
        txid: result.txid,
        txHex: result.txHex,
        vsize: result.vsize,
      },
    });
  } catch (error) {
    console.error('Error finalizing PSBT:', error);
    return c.json<ApiResponse<never>>({
      success: false,
      error: {
        code: 'FINALIZATION_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    }, 500);
  }
});

/**
 * Broadcast proposal
 */
router.post('/:id/broadcast', async (c) => {
  const proposalId = c.req.param('id');
  
  const proposal = await repo.getProposal(proposalId);
  if (!proposal) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: { code: 'NOT_FOUND', message: `Proposal not found: ${proposalId}` },
    }, 404);
  }
  
  if (proposal.status !== 'finalized') {
    return c.json<ApiResponse<never>>({
      success: false,
      error: { code: 'INVALID_STATUS', message: `Proposal is ${proposal.status}, need finalized` },
    }, 400);
  }
  
  if (!proposal.finalTx) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: { code: 'NO_TX', message: 'No finalized transaction available' },
    }, 400);
  }
  
  const multisig = await repo.getMultisig(proposal.multisigId);
  if (!multisig) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: { code: 'INVALID_MULTISIG', message: 'Multisig not found' },
    }, 400);
  }
  
  try {
    const txid = await broadcastTransaction(proposal.finalTx, multisig.chainId);
    
    await repo.updateProposalStatus(proposalId, 'broadcast', { txid });
    
    // Notify room of broadcast
    onProposalStatusChanged(proposalId, 'finalized', 'broadcast', txid);
    
    // Notify agents of successful broadcast
    webhooks.notifyBroadcast(proposal, multisig, txid).catch(err => {
      console.error('Webhook delivery error:', err);
    });
    
    return c.json<ApiResponse<any>>({
      success: true,
      data: {
        proposalId,
        status: 'broadcast',
        txid,
        explorerUrl: multisig.chainId === 'bitcoin-mainnet'
          ? `https://mempool.space/tx/${txid}`
          : `https://mempool.space/testnet/tx/${txid}`,
      },
    });
  } catch (error) {
    console.error('Error broadcasting transaction:', error);
    return c.json<ApiResponse<never>>({
      success: false,
      error: {
        code: 'BROADCAST_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    }, 500);
  }
});

/**
 * Reject a proposal
 */
router.post('/:id/reject', async (c) => {
  const proposalId = c.req.param('id');
  const body = await c.req.json();
  const parseResult = RejectProposalSchema.safeParse(body);
  
  if (!parseResult.success) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Invalid input' },
    }, 400);
  }
  
  const { agentId, reason } = parseResult.data;
  
  const proposal = await repo.getProposal(proposalId);
  if (!proposal) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: { code: 'NOT_FOUND', message: `Proposal not found: ${proposalId}` },
    }, 404);
  }
  
  if (!['pending', 'ready'].includes(proposal.status)) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: { code: 'INVALID_STATUS', message: `Cannot reject ${proposal.status} proposal` },
    }, 400);
  }
  
  await repo.updateProposalStatus(proposalId, 'rejected');
  
  return c.json<ApiResponse<any>>({
    success: true,
    data: {
      proposalId,
      status: 'rejected',
      rejectedBy: agentId,
      reason,
    },
  });
});

/**
 * List all proposals
 */
router.get('/', async (c) => {
  const status = c.req.query('status');
  const multisigId = c.req.query('multisigId');
  
  // For now, use in-memory. Full implementation would filter in DB
  const stats = await repo.getStats();
  
  return c.json<ApiResponse<any>>({
    success: true,
    data: {
      message: 'Use /multisigs/:id/proposals or /agents/:id/proposals for filtered lists',
      stats,
    },
  });
});

export default router;
