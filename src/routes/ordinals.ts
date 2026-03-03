/**
 * Ordinals Routes
 * 
 * POST /ordinals/send          - Create proposal to send an ordinal
 * GET  /ordinals/:id           - Get inscription info
 */

import { Hono } from 'hono';
import { z } from 'zod';
import type { ApiResponse, ChainId } from '../types';
import ordinals, { InscriptionInfo, getOrdinalUtxo, validateOrdinalSend } from '../services/ordinals';
import { createPSBT, type CreatePSBTInput, type PSBTResult } from '../services/psbt';
import { getAllUtxos, getFeeRate, p2trScriptPubkey } from '../services/bitcoin';
import repo from '../db/repository';

const router = new Hono();

// ═══════════════════════════════════════════════════════════════════
//                          VALIDATION
// ═══════════════════════════════════════════════════════════════════

const SendOrdinalSchema = z.object({
  multisigId: z.string().uuid(),
  inscriptionId: z.string().min(1),
  recipientAddress: z.string().min(1),
  feeRate: z.number().int().min(1).max(1000).optional(),
  note: z.string().max(500).optional(),
});

// ═══════════════════════════════════════════════════════════════════
//                            ROUTES
// ═══════════════════════════════════════════════════════════════════

/**
 * Get inscription info
 */
router.get('/:id', async (c) => {
  const inscriptionId = c.req.param('id');
  
  try {
    const inscription = await ordinals.getInscription(inscriptionId);
    
    if (!inscription) {
      return c.json<ApiResponse<never>>({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Inscription not found' },
      }, 404);
    }
    
    return c.json<ApiResponse<InscriptionInfo>>({
      success: true,
      data: inscription,
    });
  } catch (error: any) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: { code: 'INDEXER_ERROR', message: error.message },
    }, 500);
  }
});

/**
 * Create proposal to send an ordinal
 */
router.post('/send', async (c) => {
  const body = await c.req.json();
  const parseResult = SendOrdinalSchema.safeParse(body);
  
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
      error: { code: 'NOT_FOUND', message: 'Multisig not found' },
    }, 404);
  }
  
  if (!multisig.address) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: { code: 'NO_ADDRESS', message: 'Multisig has no address' },
    }, 400);
  }
  
  // Only Bitcoin mainnet for now
  if (!multisig.chainId.startsWith('bitcoin')) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: { code: 'UNSUPPORTED_CHAIN', message: 'Ordinals only supported on Bitcoin' },
    }, 400);
  }
  
  // Validate ordinal ownership
  const validation = await validateOrdinalSend(
    input.inscriptionId,
    multisig.address,
    input.recipientAddress
  );
  
  if (!validation.valid) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: { code: 'VALIDATION_FAILED', message: validation.error! },
    }, 400);
  }
  
  const inscription = validation.inscription!;
  
  // Get the ordinal's UTXO
  const ordinalUtxo = await getOrdinalUtxo(input.inscriptionId);
  if (!ordinalUtxo) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: { code: 'UTXO_NOT_FOUND', message: 'Could not find ordinal UTXO' },
    }, 400);
  }
  
  // Check for required multisig data
  if (!multisig.bitcoin?.tweakedPubkey || !multisig.bitcoin?.internalPubkey || !multisig.bitcoin?.scriptTree) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: { code: 'INVALID_MULTISIG', message: 'Multisig missing Bitcoin taproot data' },
    }, 400);
  }
  
  // Get fee rate
  const feeRate = input.feeRate || await getFeeRate(multisig.chainId as ChainId);
  
  // Get scriptPubkey
  const scriptPubkey = p2trScriptPubkey(multisig.bitcoin.tweakedPubkey);
  
  // Get all UTXOs to find fee UTXOs (exclude the ordinal UTXO)
  const allUtxos = await getAllUtxos(multisig.address, multisig.chainId as ChainId);
  const feeUtxos = allUtxos.filter(u => 
    !(u.txid === ordinalUtxo.txid && u.vout === ordinalUtxo.vout)
  );
  
  // Calculate minimum ordinal output (dust limit or offset+1)
  const minOrdinalOutput = Math.max(546, ordinalUtxo.inscriptionOffset + 1);
  
  // Build inputs array - ORDINAL FIRST (critical for FIFO)
  const inputs = [
    {
      txid: ordinalUtxo.txid,
      vout: ordinalUtxo.vout,
      amount: BigInt(ordinalUtxo.value),
      scriptPubkey,
    },
    ...feeUtxos.slice(0, 5).map(u => ({
      txid: u.txid,
      vout: u.vout,
      amount: u.amount,
      scriptPubkey,
    })),
  ];
  
  // Build outputs array - RECIPIENT FIRST (critical for FIFO)
  const outputs = [
    { address: input.recipientAddress, amount: BigInt(minOrdinalOutput) },
  ];
  
  // Create PSBT
  let psbtResult: PSBTResult;
  try {
    const psbtInput: CreatePSBTInput = {
      inputs,
      outputs,
      feeRate,
      changeAddress: multisig.address,
      chainId: multisig.chainId as ChainId,
      multisig: {
        address: multisig.address,
        internalPubkey: multisig.bitcoin.internalPubkey,
        tweakedPubkey: multisig.bitcoin.tweakedPubkey,
        scriptTree: multisig.bitcoin.scriptTree,
      },
      selectedLeafIndex: 0,
    };
    psbtResult = createPSBT(psbtInput);
  } catch (error: any) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: { code: 'PSBT_CREATION_FAILED', message: error.message },
    }, 500);
  }
  
  // Determine required signers (use first valid leaf for ordinals)
  const requiredSigners = multisig.bitcoin.scriptTree?.leaves?.[0]?.signerAgentIds || 
    multisig.agents.slice(0, multisig.threshold).map((a: any) => a.agentId);
  
  // Create proposal
  const proposalId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
  
  const proposal = {
    id: proposalId,
    multisigId: multisig.id,
    status: 'pending' as const,
    outputs: outputs.map(o => ({ address: o.address, amount: o.amount })),
    feeRate,
    fee: Number(psbtResult.fee),
    inputs: inputs.map(i => ({
      txid: i.txid,
      vout: i.vout,
      amount: i.amount,
      scriptPubkey: i.scriptPubkey,
    })),
    changeOutput: psbtResult.changeAmount > 0n ? {
      address: multisig.address,
      amount: psbtResult.changeAmount,
    } : undefined,
    selectedLeafIndex: 0,
    requiredSigners,
    signatures: [],
    unsignedTx: psbtResult.psbt,
    note: input.note || `Ordinal transfer: ${input.inscriptionId}`,
    createdBy: 'ordinal-api',
    createdAt: new Date(),
    expiresAt,
  };
  
  await repo.createProposal(proposal as any);
  
  return c.json<ApiResponse<{
    proposalId: string;
    inscriptionId: string;
    recipientAddress: string;
    sighashes: { sighash: string; inputIndex: number }[];
    requiredSigners: string[];
    estimatedFee: string;
  }>>({
    success: true,
    data: {
      proposalId,
      inscriptionId: input.inscriptionId,
      recipientAddress: input.recipientAddress,
      sighashes: psbtResult.sighashes.map(s => ({ sighash: s.sighash, inputIndex: s.inputIndex })),
      requiredSigners,
      estimatedFee: psbtResult.fee.toString(),
    },
  }, 201);
});

export default router;
