/**
 * PSBT Service
 * 
 * Handles PSBT (Partially Signed Bitcoin Transaction) operations:
 * - Creating unsigned PSBTs for proposals
 * - Computing sighashes for signing
 * - Adding signatures to PSBTs
 * - Finalizing PSBTs into broadcastable transactions
 * 
 * Uses @scure/btc-signer for all Bitcoin operations.
 */

import { hex } from '@scure/base';
import * as btc from '@scure/btc-signer';
import { sha256 } from '@noble/hashes/sha256';
import type { 
  ChainId, 
  TxOutput, 
  TxInput,
  TapLeaf,
  Multisig,
} from '../types';
import { TAPSCRIPT_LEAF_VERSION } from './taproot';

// ═══════════════════════════════════════════════════════════════════
//                       TAPTREE HELPERS
// ═══════════════════════════════════════════════════════════════════

/**
 * Build a balanced Taptree from scripts (same structure as taproot.ts)
 * Must match the tree structure used when generating the address!
 */
function buildTaptreeInternal(scripts: Uint8Array[]): btc.TaprootScriptTree {
  if (scripts.length === 0) {
    throw new Error('Cannot build tree with no scripts');
  }
  
  if (scripts.length === 1) {
    return { script: scripts[0], leafVersion: TAPSCRIPT_LEAF_VERSION };
  }
  
  // Build balanced binary tree
  const leaves: btc.TaprootScriptTree[] = scripts.map(script => ({
    script,
    leafVersion: TAPSCRIPT_LEAF_VERSION,
  }));
  
  // Combine leaves pairwise until we have a single root
  while (leaves.length > 1) {
    const nextLevel: btc.TaprootScriptTree[] = [];
    
    for (let i = 0; i < leaves.length; i += 2) {
      if (i + 1 < leaves.length) {
        nextLevel.push([leaves[i], leaves[i + 1]]);
      } else {
        nextLevel.push(leaves[i]);
      }
    }
    
    leaves.length = 0;
    leaves.push(...nextLevel);
  }
  
  return leaves[0];
}

// ═══════════════════════════════════════════════════════════════════
//                          TYPES
// ═══════════════════════════════════════════════════════════════════

export interface CreatePSBTInput {
  /** UTXOs to spend */
  inputs: TxInput[];
  /** Outputs (recipients) */
  outputs: TxOutput[];
  /** Fee rate in sat/vB */
  feeRate: number;
  /** Change address (usually back to the multisig) */
  changeAddress: string;
  /** Network */
  chainId: ChainId;
  /** Multisig details for input scripts */
  multisig: {
    address: string;
    internalPubkey: string;
    tweakedPubkey: string;
    scriptTree: { leaves: TapLeaf[] };
  };
  /** Which leaf to use for signing */
  selectedLeafIndex: number;
}

export interface PSBTResult {
  /** Base64-encoded PSBT */
  psbt: string;
  /** Hex-encoded PSBT */
  psbtHex: string;
  /** Fee in satoshis */
  fee: bigint;
  /** Change amount (0 if no change) */
  changeAmount: bigint;
  /** Virtual size estimate */
  vsize: number;
  /** Sighash for each input */
  sighashes: {
    inputIndex: number;
    sighash: string;
    leafHash: string;
  }[];
}

export interface SignPSBTInput {
  /** Base64-encoded PSBT */
  psbt: string;
  /** Input index to sign */
  inputIndex: number;
  /** 64-byte Schnorr signature (hex) */
  signature: string;
  /** x-only pubkey that signed (hex) */
  pubkey: string;
}

export interface FinalizePSBTResult {
  /** Finalized transaction hex */
  txHex: string;
  /** Transaction ID */
  txid: string;
  /** Virtual size */
  vsize: number;
}

// ═══════════════════════════════════════════════════════════════════
//                       NETWORK CONFIG
// ═══════════════════════════════════════════════════════════════════

function getNetwork(chainId: ChainId): typeof btc.NETWORK {
  switch (chainId) {
    case 'bitcoin-mainnet':
      return btc.NETWORK;
    case 'bitcoin-testnet':
    case 'bitcoin-signet':
      return btc.TEST_NETWORK;
    default:
      throw new Error(`Unsupported chain: ${chainId}`);
  }
}

// ═══════════════════════════════════════════════════════════════════
//                       FEE ESTIMATION
// ═══════════════════════════════════════════════════════════════════

/**
 * Estimate virtual size for a P2TR script-path spend
 * 
 * Rough estimates:
 * - Input: ~57.5 vB base + witness
 * - P2TR script-path witness: varies by script size and signatures
 * - Output P2TR: 43 vB
 * - Output P2WPKH: 31 vB
 * - Overhead: 10.5 vB
 */
function estimateVsize(
  numInputs: number,
  numOutputs: number,
  numSignatures: number,
  scriptSize: number
): number {
  // P2TR input base: 41 bytes (outpoint + sequence)
  const inputBase = 41 * numInputs;
  
  // Witness per input for script-path:
  // - Each signature: 64 bytes (could be 65 with sighash byte)
  // - Script: scriptSize bytes
  // - Control block: 33 + 32*depth bytes (assume depth 2 for 3-leaf tree)
  const witnessPerInput = (64 * numSignatures) + scriptSize + (33 + 32 * 2);
  const witnessWeight = witnessPerInput * numInputs;
  
  // Outputs (assume P2TR for simplicity)
  const outputSize = 43 * numOutputs;
  
  // Transaction overhead
  const overhead = 11; // version + locktime + counts
  
  // vsize = (base * 4 + witness) / 4
  const baseWeight = (inputBase + outputSize + overhead) * 4;
  const totalWeight = baseWeight + witnessWeight;
  
  return Math.ceil(totalWeight / 4);
}

// ═══════════════════════════════════════════════════════════════════
//                       PSBT CREATION
// ═══════════════════════════════════════════════════════════════════

/**
 * Create an unsigned PSBT for a multisig transaction
 */
export function createPSBT(input: CreatePSBTInput): PSBTResult {
  const { 
    inputs, 
    outputs, 
    feeRate, 
    changeAddress, 
    chainId,
    multisig,
    selectedLeafIndex,
  } = input;
  
  const network = getNetwork(chainId);
  
  // Get the selected leaf
  const selectedLeaf = multisig.scriptTree.leaves[selectedLeafIndex];
  if (!selectedLeaf) {
    throw new Error(`Invalid leaf index: ${selectedLeafIndex}`);
  }
  
  // Calculate totals
  const totalInput = inputs.reduce((sum, i) => sum + i.amount, 0n);
  const totalOutput = outputs.reduce((sum, o) => sum + o.amount, 0n);
  
  // Estimate fee
  const numSignatures = selectedLeaf.signerPubkeys.length;
  const scriptSize = selectedLeaf.script.length / 2; // hex to bytes
  const estimatedVsize = estimateVsize(
    inputs.length,
    outputs.length + 1, // +1 for potential change
    numSignatures,
    scriptSize
  );
  const estimatedFee = BigInt(Math.ceil(estimatedVsize * feeRate));
  
  // Calculate change
  const changeAmount = totalInput - totalOutput - estimatedFee;
  
  if (changeAmount < 0n) {
    throw new Error(
      `Insufficient funds: have ${totalInput} sats, need ${totalOutput + estimatedFee} sats`
    );
  }
  
  // Build transaction using @scure/btc-signer
  const tx = new btc.Transaction();
  
  // Rebuild the FULL Taptree (same structure as when address was created)
  const allScripts = multisig.scriptTree.leaves.map(leaf => hex.decode(leaf.script));
  const fullTaptree = buildTaptreeInternal(allScripts);
  
  // Create P2TR with full tree - this gives us the correct script/address
  // and tapLeafScript with control blocks for ALL leaves
  const p2trOutput = btc.p2tr(
    hex.decode(multisig.internalPubkey),
    fullTaptree,
    network
  );
  
  // Add inputs with full taproot info
  // btc-signer's tapLeafScript contains all leaves with their control blocks
  for (const utxo of inputs) {
    tx.addInput({
      txid: utxo.txid,
      index: utxo.vout,
      witnessUtxo: {
        script: p2trOutput.script,
        amount: utxo.amount,
      },
      tapInternalKey: p2trOutput.tapInternalKey,
      tapMerkleRoot: p2trOutput.tapMerkleRoot,
      tapLeafScript: p2trOutput.tapLeafScript,
    });
  }
  
  // Add outputs
  for (const output of outputs) {
    tx.addOutputAddress(output.address, output.amount, network);
  }
  
  // Add change output if significant (> dust threshold of 546 sats)
  if (changeAmount > 546n) {
    tx.addOutputAddress(changeAddress, changeAmount, network);
  }
  
  // Get PSBT bytes
  const psbtBytes = tx.toPSBT();
  const psbtBase64 = btoa(String.fromCharCode(...psbtBytes));
  const psbtHex = hex.encode(psbtBytes);
  
  // Compute sighashes for each input
  const sighashes = inputs.map((_, inputIndex) => {
    // Get sighash for Taproot script-path
    // BIP 341 sighash with SIGHASH_DEFAULT (0x00)
    const sighash = tx.preimageHash(inputIndex, btc.SigHash.DEFAULT, true);
    
    // Compute leaf hash
    const leafScript = hex.decode(selectedLeaf.script);
    const leafHash = computeLeafHash(leafScript);
    
    return {
      inputIndex,
      sighash: hex.encode(sighash),
      leafHash: hex.encode(leafHash),
    };
  });
  
  return {
    psbt: psbtBase64,
    psbtHex,
    fee: estimatedFee,
    changeAmount: changeAmount > 546n ? changeAmount : 0n,
    vsize: estimatedVsize,
    sighashes,
  };
}

/**
 * Compute leaf hash for a Tapscript
 */
function computeLeafHash(script: Uint8Array): Uint8Array {
  // TapLeaf hash = tagged_hash("TapLeaf", leaf_version || compact_size(script) || script)
  const leafVersion = new Uint8Array([TAPSCRIPT_LEAF_VERSION]);
  const scriptLen = compactSizeEncode(script.length);
  
  const data = new Uint8Array(1 + scriptLen.length + script.length);
  data.set(leafVersion, 0);
  data.set(scriptLen, 1);
  data.set(script, 1 + scriptLen.length);
  
  return taggedHash('TapLeaf', data);
}

/**
 * Tagged hash helper
 */
function taggedHash(tag: string, data: Uint8Array): Uint8Array {
  const tagHash = sha256(new TextEncoder().encode(tag));
  const combined = new Uint8Array(tagHash.length * 2 + data.length);
  combined.set(tagHash, 0);
  combined.set(tagHash, tagHash.length);
  combined.set(data, tagHash.length * 2);
  return sha256(combined);
}

/**
 * Compact size encoding
 */
function compactSizeEncode(n: number): Uint8Array {
  if (n < 0xfd) {
    return new Uint8Array([n]);
  } else if (n <= 0xffff) {
    const buf = new Uint8Array(3);
    buf[0] = 0xfd;
    buf[1] = n & 0xff;
    buf[2] = (n >> 8) & 0xff;
    return buf;
  } else {
    throw new Error('Script too large');
  }
}

// ═══════════════════════════════════════════════════════════════════
//                       PSBT SIGNING
// ═══════════════════════════════════════════════════════════════════

/**
 * Add a signature to a PSBT
 */
export function addSignatureToPSBT(input: SignPSBTInput): string {
  const { psbt, inputIndex, signature, pubkey } = input;
  
  // Decode PSBT
  const psbtBytes = Uint8Array.from(atob(psbt), c => c.charCodeAt(0));
  const tx = btc.Transaction.fromPSBT(psbtBytes);
  
  // Validate signature length (64 bytes for Schnorr)
  if (signature.length !== 128) {
    throw new Error(`Invalid signature length: ${signature.length} (expected 128 hex chars)`);
  }
  
  // Add partial signature
  // Note: For Taproot script-path, we need to add to tapScriptSig
  const sigBytes = hex.decode(signature);
  const pubkeyBytes = hex.decode(pubkey);
  
  // The signature format for script-path is just the 64-byte sig
  // (no sighash byte for SIGHASH_DEFAULT)
  tx.updateInput(inputIndex, {
    tapScriptSig: [
      {
        pubKey: pubkeyBytes,
        signature: sigBytes,
      },
    ],
  });
  
  // Return updated PSBT
  const updatedPsbt = tx.toPSBT();
  return btoa(String.fromCharCode(...updatedPsbt));
}

/**
 * Check if a PSBT has enough signatures for the given threshold
 */
export function checkPSBTThreshold(
  psbt: string,
  inputIndex: number,
  threshold: number
): { met: boolean; count: number } {
  const psbtBytes = Uint8Array.from(atob(psbt), c => c.charCodeAt(0));
  const tx = btc.Transaction.fromPSBT(psbtBytes);
  
  const input = tx.getInput(inputIndex);
  const sigs = input.tapScriptSig || [];
  
  return {
    met: sigs.length >= threshold,
    count: sigs.length,
  };
}

// ═══════════════════════════════════════════════════════════════════
//                      PSBT FINALIZATION
// ═══════════════════════════════════════════════════════════════════

/**
 * Finalize a PSBT and extract the transaction
 * 
 * This builds the witness stack for script-path spending:
 * - Signatures (in reverse pubkey order)
 * - Script
 * - Control block
 */
export function finalizePSBT(
  psbt: string,
  multisig: {
    internalPubkey: string;
    scriptTree: { leaves: TapLeaf[] };
  },
  selectedLeafIndex: number
): FinalizePSBTResult {
  const psbtBytes = Uint8Array.from(atob(psbt), c => c.charCodeAt(0));
  const tx = btc.Transaction.fromPSBT(psbtBytes);
  
  const selectedLeaf = multisig.scriptTree.leaves[selectedLeafIndex];
  if (!selectedLeaf) {
    throw new Error(`Invalid leaf index: ${selectedLeafIndex}`);
  }
  
  // Finalize each input
  // btc-signer should handle witness construction automatically
  tx.finalize();
  
  // Extract final transaction
  const finalTx = tx.extract();
  const txHex = hex.encode(finalTx);
  
  // Compute txid (double SHA256 of tx, reversed)
  const txHash = sha256(sha256(finalTx));
  const txid = hex.encode(txHash.reverse());
  
  return {
    txHex,
    txid,
    vsize: tx.vsize,
  };
}

// ═══════════════════════════════════════════════════════════════════
//                       PSBT INSPECTION
// ═══════════════════════════════════════════════════════════════════

/**
 * Parse and inspect a PSBT
 */
export function inspectPSBT(psbt: string): {
  inputs: {
    txid: string;
    vout: number;
    amount: bigint;
    signatures: { pubkey: string; signature: string }[];
  }[];
  outputs: {
    address: string;
    amount: bigint;
  }[];
  fee: bigint;
} {
  const psbtBytes = Uint8Array.from(atob(psbt), c => c.charCodeAt(0));
  const tx = btc.Transaction.fromPSBT(psbtBytes);
  
  const inputs = [];
  for (let i = 0; i < tx.inputsLength; i++) {
    const input = tx.getInput(i);
    const sigs = (input.tapScriptSig || []).map(s => ({
      pubkey: hex.encode(s.pubKey),
      signature: hex.encode(s.signature),
    }));
    
    inputs.push({
      txid: input.txid ? hex.encode(input.txid) : '',
      vout: input.index || 0,
      amount: input.witnessUtxo?.amount || 0n,
      signatures: sigs,
    });
  }
  
  const outputs = [];
  for (let i = 0; i < tx.outputsLength; i++) {
    const output = tx.getOutput(i);
    outputs.push({
      address: output.address || '',
      amount: output.amount || 0n,
    });
  }
  
  const totalInput = inputs.reduce((sum, i) => sum + i.amount, 0n);
  const totalOutput = outputs.reduce((sum, o) => sum + o.amount, 0n);
  
  return {
    inputs,
    outputs,
    fee: totalInput - totalOutput,
  };
}

export default {
  createPSBT,
  addSignatureToPSBT,
  checkPSBTThreshold,
  finalizePSBT,
  inspectPSBT,
};
