/**
 * Taproot Service
 * 
 * Handles P2TR script-path multisig construction:
 * - Building Tapscript leaves for m-of-n
 * - Computing Merkle trees
 * - Deriving tweaked pubkeys and addresses
 * - Computing control blocks for spending
 * 
 * Uses @scure/btc-signer for cryptographic operations.
 */

import { hex } from '@scure/base';
import * as btc from '@scure/btc-signer';
import { sha256 } from '@noble/hashes/sha256';
import { secp256k1 } from '@noble/curves/secp256k1';
import type { 
  Agent, 
  ChainId, 
  TapTree, 
  TapLeaf,
  Multisig,
  MultisigCreateInput,
} from '../types';

// ═══════════════════════════════════════════════════════════════════
//                          CONSTANTS
// ═══════════════════════════════════════════════════════════════════

/**
 * Unspendable internal pubkey (NUMS point)
 * 
 * This is a standard "nothing up my sleeve" point for script-only Taproot.
 * Generated as: lift_x(SHA256("agent-multisig/unspendable"))
 * 
 * Using this means the key-path is unspendable; only script-path works.
 */
export const UNSPENDABLE_INTERNAL_KEY = hex.decode(
  '50929b74c1a04954b78b4b6035e97a5e078a5a0f28ec96d547bfee9ace803ac0'
);

/**
 * Leaf version for standard Tapscript (BIP 342)
 */
export const TAPSCRIPT_LEAF_VERSION = 0xc0;

// ═══════════════════════════════════════════════════════════════════
//                       TAGGED HASHING
// ═══════════════════════════════════════════════════════════════════

/**
 * BIP 340 tagged hash: SHA256(SHA256(tag) || SHA256(tag) || data)
 */
function taggedHash(tag: string, data: Uint8Array): Uint8Array {
  const tagHash = sha256(new TextEncoder().encode(tag));
  const combined = new Uint8Array(tagHash.length * 2 + data.length);
  combined.set(tagHash, 0);
  combined.set(tagHash, tagHash.length);
  combined.set(data, tagHash.length * 2);
  return sha256(combined);
}

// ═══════════════════════════════════════════════════════════════════
//                     TAPSCRIPT CONSTRUCTION
// ═══════════════════════════════════════════════════════════════════

/**
 * Opcodes we need
 */
const OP = {
  CHECKSIG: 0xac,
  CHECKSIGADD: 0xba,
  NUMEQUAL: 0x9c,
  // OP_1 through OP_16 are 0x51-0x60
  num: (n: number): number => {
    if (n >= 1 && n <= 16) return 0x50 + n;
    throw new Error(`Number ${n} cannot be encoded as OP_N`);
  },
};

/**
 * Build a Tapscript for threshold signing using OP_CHECKSIGADD
 * 
 * Script structure:
 *   <pubkey_1> OP_CHECKSIG
 *   <pubkey_2> OP_CHECKSIGADD
 *   ...
 *   <pubkey_n> OP_CHECKSIGADD
 *   <m> OP_NUMEQUAL
 * 
 * @param pubkeys - Array of x-only pubkeys (32 bytes each, Uint8Array)
 * @param threshold - Number of signatures required
 * @returns Uint8Array Tapscript
 */
export function buildChecksigAddScript(
  pubkeys: Uint8Array[],
  threshold: number
): Uint8Array {
  if (pubkeys.length < threshold) {
    throw new Error(`Not enough pubkeys (${pubkeys.length}) for threshold (${threshold})`);
  }
  
  if (threshold < 1 || threshold > 16) {
    throw new Error('Threshold must be between 1 and 16');
  }
  
  if (pubkeys.length > 20) {
    throw new Error('Too many pubkeys (max 20)');
  }
  
  // Validate pubkey lengths
  for (const pk of pubkeys) {
    if (pk.length !== 32) {
      throw new Error(`Invalid pubkey length: ${pk.length} (expected 32)`);
    }
  }
  
  // Calculate total script size
  // Each pubkey: 1 (push 32) + 32 (pubkey) + 1 (opcode) = 34 bytes
  // Final: 1 (OP_N) + 1 (OP_NUMEQUAL) = 2 bytes
  const scriptSize = pubkeys.length * 34 + 2;
  const script = new Uint8Array(scriptSize);
  let offset = 0;
  
  // First pubkey: <pk> OP_CHECKSIG
  script[offset++] = 0x20; // Push 32 bytes
  script.set(pubkeys[0], offset);
  offset += 32;
  script[offset++] = OP.CHECKSIG;
  
  // Remaining pubkeys: <pk> OP_CHECKSIGADD
  for (let i = 1; i < pubkeys.length; i++) {
    script[offset++] = 0x20; // Push 32 bytes
    script.set(pubkeys[i], offset);
    offset += 32;
    script[offset++] = OP.CHECKSIGADD;
  }
  
  // Threshold: <m> OP_NUMEQUAL
  script[offset++] = OP.num(threshold);
  script[offset++] = OP.NUMEQUAL;
  
  return script;
}

/**
 * Get all k-combinations of an array (preserving order)
 */
function getCombinations<T>(arr: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (arr.length === 0) return [];
  if (k > arr.length) return [];
  
  const [first, ...rest] = arr;
  
  // Combinations that include first element
  const withFirst = getCombinations(rest, k - 1).map(combo => [first, ...combo]);
  
  // Combinations that don't include first element  
  const withoutFirst = getCombinations(rest, k);
  
  return [...withFirst, ...withoutFirst];
}

/**
 * Build all script leaves for m-of-n multisig
 * 
 * For 2-of-3 with pubkeys [A, B, C], creates leaves for:
 * - A + B
 * - A + C
 * - B + C
 */
export function buildMultisigLeaves(
  pubkeys: Uint8Array[],
  threshold: number
): { script: Uint8Array; pubkeyIndices: number[] }[] {
  const combinations = getCombinations(
    pubkeys.map((pk, i) => ({ pk, i })),
    threshold
  );
  
  return combinations.map(combo => {
    // Sort pubkeys lexicographically for determinism
    const sorted = [...combo].sort((a, b) => {
      for (let i = 0; i < 32; i++) {
        if (a.pk[i] !== b.pk[i]) return a.pk[i] - b.pk[i];
      }
      return 0;
    });
    
    const script = buildChecksigAddScript(
      sorted.map(x => x.pk),
      threshold
    );
    
    return {
      script,
      pubkeyIndices: sorted.map(x => x.i),
    };
  });
}

// ═══════════════════════════════════════════════════════════════════
//                  P2TR ADDRESS GENERATION
// ═══════════════════════════════════════════════════════════════════

/**
 * Network configuration
 */
type Network = 'mainnet' | 'testnet';

function getNetworkConfig(chainId: ChainId): { bech32Prefix: string; network: Network } {
  switch (chainId) {
    case 'bitcoin-mainnet':
      return { bech32Prefix: 'bc', network: 'mainnet' };
    case 'bitcoin-testnet':
    case 'bitcoin-signet':
      return { bech32Prefix: 'tb', network: 'testnet' };
    default:
      throw new Error(`Unsupported chain for Taproot: ${chainId}`);
  }
}

/**
 * Build a Taptree from scripts using @scure/btc-signer
 * 
 * The tree structure affects efficiency - more likely paths should be
 * closer to the root. For simplicity, we use a balanced tree.
 */
function buildTaptree(scripts: Uint8Array[]): btc.TaprootScriptTree {
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

/**
 * Result of creating a P2TR multisig address
 */
export interface P2TRMultisigResult {
  address: string;
  internalPubkey: string;        // Hex
  tweakedPubkey: string;         // Hex
  scriptTree: TapTree;
  leaves: {
    index: number;
    script: string;              // Hex
    controlBlock: string;        // Hex
    signerIndices: number[];     // Which pubkeys sign this leaf
  }[];
}

/**
 * Create a P2TR multisig address from pubkeys
 * 
 * @param xOnlyPubkeys - Array of 32-byte x-only pubkeys (hex strings)
 * @param threshold - Number of signatures required
 * @param chainId - Bitcoin network
 * @returns P2TR address and script tree info
 */
export function createP2TRMultisig(
  xOnlyPubkeys: string[],
  threshold: number,
  chainId: ChainId
): P2TRMultisigResult {
  // Validate inputs
  if (xOnlyPubkeys.length < 2) {
    throw new Error('Need at least 2 pubkeys for multisig');
  }
  
  if (threshold < 2) {
    throw new Error('Threshold must be at least 2');
  }
  
  if (threshold > xOnlyPubkeys.length) {
    throw new Error(`Threshold (${threshold}) cannot exceed number of pubkeys (${xOnlyPubkeys.length})`);
  }
  
  const { network } = getNetworkConfig(chainId);
  const btcNetwork = network === 'mainnet' ? btc.NETWORK : btc.TEST_NETWORK;
  
  // Convert hex strings to Uint8Arrays
  const pubkeyBytes = xOnlyPubkeys.map(pk => {
    if (pk.length !== 64) {
      throw new Error(`Invalid pubkey length: ${pk.length} (expected 64 hex chars)`);
    }
    return hex.decode(pk);
  });
  
  // Build all threshold-combination scripts
  const leafData = buildMultisigLeaves(pubkeyBytes, threshold);
  
  // Build the Taptree
  const scripts = leafData.map(l => l.script);
  const taptree = buildTaptree(scripts);
  
  // Create P2TR output using @scure/btc-signer
  const p2tr = btc.p2tr(
    UNSPENDABLE_INTERNAL_KEY,
    taptree,
    btcNetwork
  );
  
  if (!p2tr.address) {
    throw new Error('Failed to generate P2TR address');
  }
  
  // Build leaves data
  // Note: Control blocks are computed at signing time using the script and merkle proof
  // For now, we store the scripts and will compute control blocks when needed
  const leaves = leafData.map((leaf, index) => {
    return {
      index,
      script: hex.encode(leaf.script),
      controlBlock: '', // Computed at signing time
      signerIndices: leaf.pubkeyIndices,
    };
  });
  
  // Build TapTree structure for storage
  const scriptTree: TapTree = {
    leaves: leaves.map((leaf, index) => ({
      index,
      script: leaf.script,
      scriptHash: hex.encode(taggedHash('TapLeaf', 
        new Uint8Array([TAPSCRIPT_LEAF_VERSION, ...compactSizeEncode(leaf.script.length / 2), ...hex.decode(leaf.script)])
      )),
      leafVersion: TAPSCRIPT_LEAF_VERSION,
      controlBlock: leaf.controlBlock,
      signerPubkeys: leaf.signerIndices.map(i => xOnlyPubkeys[i]),
      signerAgentIds: [], // Filled in by caller
    })),
    root: p2tr.tapMerkleRoot ? hex.encode(p2tr.tapMerkleRoot) : '',
  };
  
  return {
    address: p2tr.address,
    internalPubkey: hex.encode(UNSPENDABLE_INTERNAL_KEY),
    tweakedPubkey: p2tr.tweakedPubkey ? hex.encode(p2tr.tweakedPubkey) : '',
    scriptTree,
    leaves,
  };
}

/**
 * Encode a number as Bitcoin compact size
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
  } else if (n <= 0xffffffff) {
    const buf = new Uint8Array(5);
    buf[0] = 0xfe;
    buf[1] = n & 0xff;
    buf[2] = (n >> 8) & 0xff;
    buf[3] = (n >> 16) & 0xff;
    buf[4] = (n >> 24) & 0xff;
    return buf;
  } else {
    throw new Error('Number too large for compact size');
  }
}

// ═══════════════════════════════════════════════════════════════════
//                     HIGH-LEVEL API
// ═══════════════════════════════════════════════════════════════════

/**
 * Convert a compressed pubkey (33 bytes) to x-only (32 bytes)
 */
export function compressedToXOnly(compressedPubkey: string): string {
  if (compressedPubkey.length === 64) {
    // Already x-only
    return compressedPubkey;
  }
  
  if (compressedPubkey.length === 66) {
    // Remove 02/03 prefix
    return compressedPubkey.slice(2);
  }
  
  throw new Error(`Invalid pubkey length: ${compressedPubkey.length}`);
}

/**
 * Create a multisig from agent inputs
 */
export async function createMultisigFromAgents(
  input: MultisigCreateInput
): Promise<{
  address: string;
  internalPubkey: string;
  tweakedPubkey: string;
  scriptTree: TapTree;
  agentPubkeyMap: Map<string, number>; // agentId → pubkey index
}> {
  const { chainId, agents, threshold } = input;
  
  if (!chainId.startsWith('bitcoin-')) {
    throw new Error('This function only supports Bitcoin chains');
  }
  
  // Extract and normalize pubkeys
  const agentPubkeys: { agentId: string; xOnlyPubkey: string }[] = agents.map(agent => {
    const xOnly = compressedToXOnly(agent.publicKey);
    return {
      agentId: agent.id,
      xOnlyPubkey: xOnly,
    };
  });
  
  // Sort agents by pubkey for deterministic ordering
  agentPubkeys.sort((a, b) => a.xOnlyPubkey.localeCompare(b.xOnlyPubkey));
  
  // Create the P2TR multisig
  const result = createP2TRMultisig(
    agentPubkeys.map(a => a.xOnlyPubkey),
    threshold,
    chainId
  );
  
  // Map agent IDs to pubkey indices
  const agentPubkeyMap = new Map<string, number>();
  agentPubkeys.forEach((ap, index) => {
    agentPubkeyMap.set(ap.agentId, index);
  });
  
  // Fill in agent IDs in script tree
  for (const leaf of result.scriptTree.leaves) {
    leaf.signerAgentIds = leaf.signerPubkeys.map(pk => {
      const agent = agentPubkeys.find(a => a.xOnlyPubkey === pk);
      return agent?.agentId || '';
    });
  }
  
  return {
    address: result.address,
    internalPubkey: result.internalPubkey,
    tweakedPubkey: result.tweakedPubkey,
    scriptTree: result.scriptTree,
    agentPubkeyMap,
  };
}

export default {
  buildChecksigAddScript,
  buildMultisigLeaves,
  createP2TRMultisig,
  createMultisigFromAgents,
  compressedToXOnly,
  UNSPENDABLE_INTERNAL_KEY,
  TAPSCRIPT_LEAF_VERSION,
};
