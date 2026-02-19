/**
 * Stacks Adapter
 * 
 * Implements SIP-018 structured data signing for Stacks multisig coordination.
 * 
 * Key concepts:
 * - messageHash = SHA256("SIP018" || domainHash || structuredDataHash)
 * - Signatures are secp256k1 ECDSA in RSV order (65 bytes)
 * - Verifiable on-chain using secp256k1-verify in Clarity
 * 
 * @see https://github.com/stacksgov/sips/blob/main/sips/sip-018/sip-018-signed-structured-data.md
 */

import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';

// SIP-018 Constants
const SIP018_PREFIX = new TextEncoder().encode('SIP018');

// Domain for Agent Multisig
const DEFAULT_DOMAIN = {
  name: 'agent-multisig',
  version: '1',
  chainId: 1, // Stacks mainnet
};

// Stacks chain IDs
export const STACKS_CHAINS = {
  'stacks-mainnet': 1,
  'stacks-testnet': 2147483648, // 0x80000000
} as const;

export type StacksChainId = keyof typeof STACKS_CHAINS;

/**
 * Check if a chain ID is a Stacks chain
 */
export function isStacksChain(chainId: string): chainId is StacksChainId {
  return chainId in STACKS_CHAINS;
}

/**
 * Get numeric chain ID for Stacks network
 */
export function getStacksChainId(chainId: StacksChainId): number {
  return STACKS_CHAINS[chainId];
}

/**
 * Clarity Value Types for wire format encoding
 * @see SIP-005
 */
enum ClarityType {
  Int = 0x00,
  UInt = 0x01,
  Buffer = 0x02,
  BoolTrue = 0x03,
  BoolFalse = 0x04,
  PrincipalStandard = 0x05,
  PrincipalContract = 0x06,
  ResponseOk = 0x07,
  ResponseErr = 0x08,
  OptionalNone = 0x09,
  OptionalSome = 0x0a,
  List = 0x0b,
  Tuple = 0x0c,
  StringASCII = 0x0d,
  StringUTF8 = 0x0e,
}

/**
 * Encode a string-ascii Clarity value to wire format
 */
function encodeStringAscii(str: string): Uint8Array {
  const strBytes = new TextEncoder().encode(str);
  const lengthBytes = new Uint8Array(4);
  new DataView(lengthBytes.buffer).setUint32(0, strBytes.length, false);
  
  return new Uint8Array([
    ClarityType.StringASCII,
    ...lengthBytes,
    ...strBytes
  ]);
}

/**
 * Encode a uint Clarity value to wire format
 */
function encodeUint(value: bigint | number): Uint8Array {
  const bigValue = BigInt(value);
  const bytes = new Uint8Array(16);
  
  // Write as big-endian 128-bit integer
  let remaining = bigValue;
  for (let i = 15; i >= 0; i--) {
    bytes[i] = Number(remaining & BigInt(0xff));
    remaining = remaining >> BigInt(8);
  }
  
  return new Uint8Array([ClarityType.UInt, ...bytes]);
}

/**
 * Encode a tuple Clarity value to wire format
 */
function encodeTuple(fields: Record<string, Uint8Array>): Uint8Array {
  const keys = Object.keys(fields).sort(); // Keys must be sorted
  const parts: Uint8Array[] = [];
  
  // Tuple type byte
  parts.push(new Uint8Array([ClarityType.Tuple]));
  
  // Number of fields (4 bytes)
  const countBytes = new Uint8Array(4);
  new DataView(countBytes.buffer).setUint32(0, keys.length, false);
  parts.push(countBytes);
  
  // Each field: key length (1 byte), key, value
  for (const key of keys) {
    const keyBytes = new TextEncoder().encode(key);
    parts.push(new Uint8Array([keyBytes.length]));
    parts.push(keyBytes);
    parts.push(fields[key]);
  }
  
  // Concatenate all parts
  const totalLength = parts.reduce((sum, p) => sum + p.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  
  return result;
}

/**
 * SIP-018 Domain type
 */
export interface SIP018Domain {
  name: string;
  version: string;
  chainId: number;
}

/**
 * Encode domain to wire format and hash
 */
export function encodeDomain(domain: SIP018Domain): Uint8Array {
  const encoded = encodeTuple({
    'chain-id': encodeUint(domain.chainId),
    'name': encodeStringAscii(domain.name),
    'version': encodeStringAscii(domain.version),
  });
  return sha256(encoded);
}

/**
 * Encode structured data to wire format and hash
 */
export function encodeStructuredData(data: Uint8Array): Uint8Array {
  return sha256(data);
}

/**
 * Build SIP-018 message hash
 * 
 * messageHash = SHA256("SIP018" || domainHash || structuredDataHash)
 */
export function buildSIP018MessageHash(
  domain: SIP018Domain,
  structuredData: Uint8Array
): Uint8Array {
  const domainHash = encodeDomain(domain);
  const dataHash = encodeStructuredData(structuredData);
  
  // Concatenate: prefix || domainHash || dataHash
  const message = new Uint8Array(
    SIP018_PREFIX.length + domainHash.length + dataHash.length
  );
  message.set(SIP018_PREFIX, 0);
  message.set(domainHash, SIP018_PREFIX.length);
  message.set(dataHash, SIP018_PREFIX.length + domainHash.length);
  
  return sha256(message);
}

/**
 * Proposal data for multisig signing
 */
export interface StacksProposalData {
  multisigId: string;
  proposalId: string;
  action: 'transfer' | 'contract-call';
  recipient?: string;
  amount?: bigint;
  contractAddress?: string;
  functionName?: string;
  nonce: number;
}

/**
 * Encode proposal data as Clarity tuple
 */
export function encodeProposalData(proposal: StacksProposalData): Uint8Array {
  const fields: Record<string, Uint8Array> = {
    'action': encodeStringAscii(proposal.action),
    'multisig-id': encodeStringAscii(proposal.multisigId),
    'nonce': encodeUint(proposal.nonce),
    'proposal-id': encodeStringAscii(proposal.proposalId),
  };
  
  if (proposal.amount !== undefined) {
    fields['amount'] = encodeUint(proposal.amount);
  }
  
  // Add other fields as needed...
  
  return encodeTuple(fields);
}

/**
 * Build signing payload for a Stacks proposal
 */
export function buildStacksSigningPayload(
  proposal: StacksProposalData,
  chainId: StacksChainId = 'stacks-mainnet'
): { digest: string; domain: SIP018Domain; message: string } {
  const domain: SIP018Domain = {
    ...DEFAULT_DOMAIN,
    chainId: getStacksChainId(chainId),
  };
  
  const structuredData = encodeProposalData(proposal);
  const messageHash = buildSIP018MessageHash(domain, structuredData);
  
  return {
    digest: bytesToHex(messageHash),
    domain,
    message: `Sign proposal ${proposal.proposalId} for multisig ${proposal.multisigId}`,
  };
}

/**
 * Stacks Adapter for multisig coordination
 */
export class StacksAdapter {
  readonly provider = 'stacks';
  readonly chainId: StacksChainId;
  
  constructor(chainId: StacksChainId = 'stacks-mainnet') {
    this.chainId = chainId;
  }
  
  /**
   * Get supported chains
   */
  supportedChains(): string[] {
    return Object.keys(STACKS_CHAINS);
  }
  
  /**
   * Build signing payload for proposal
   */
  getSigningPayload(proposal: StacksProposalData): {
    digest: string;
    raw: {
      stacks: {
        domain: SIP018Domain;
        structuredData: string;
      };
    };
    message: string;
  } {
    const domain: SIP018Domain = {
      ...DEFAULT_DOMAIN,
      chainId: getStacksChainId(this.chainId),
    };
    
    const structuredData = encodeProposalData(proposal);
    const messageHash = buildSIP018MessageHash(domain, structuredData);
    
    return {
      digest: bytesToHex(messageHash),
      raw: {
        stacks: {
          domain,
          structuredData: bytesToHex(structuredData),
        },
      },
      message: `Sign proposal ${proposal.proposalId}: ${proposal.action}`,
    };
  }
  
  /**
   * Verify a SIP-018 signature
   * 
   * Note: Full implementation would use secp256k1 verification
   */
  async verifySignature(
    digest: string,
    signature: string,
    publicKey: string
  ): Promise<boolean> {
    // TODO: Implement secp256k1 ECDSA verification
    // Signature is RSV format (65 bytes)
    // Public key is compressed (33 bytes)
    throw new Error('Not implemented - use @stacks/transactions for verification');
  }
}

/**
 * Create Stacks adapter
 */
export function createStacksAdapter(chainId: StacksChainId = 'stacks-mainnet'): StacksAdapter {
  return new StacksAdapter(chainId);
}
