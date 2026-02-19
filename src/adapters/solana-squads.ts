/**
 * Solana Squads Adapter
 * 
 * Wraps the Squads Protocol for Solana multisig operations.
 * 
 * Key concepts:
 * - Squads uses PDAs (Program Derived Addresses) for multisig accounts
 * - Signatures are ed25519 (64 bytes) - DIFFERENT from Bitcoin/Ethereum!
 * - Transactions are approved individually, then executed when threshold met
 * 
 * @see https://docs.squads.so/
 * @see https://github.com/Squads-Protocol/v4
 */

// Note: This is a scaffold. Full implementation requires @sqds/multisig SDK.

export const SOLANA_CHAINS = {
  'solana-mainnet': 'mainnet-beta',
  'solana-devnet': 'devnet',
  'solana-testnet': 'testnet',
} as const;

export type SolanaChainId = keyof typeof SOLANA_CHAINS;

/**
 * Check if a chain ID is a Solana chain
 */
export function isSolanaChain(chainId: string): chainId is SolanaChainId {
  return chainId in SOLANA_CHAINS;
}

/**
 * Get Solana cluster name
 */
export function getSolanaCluster(chainId: SolanaChainId): string {
  return SOLANA_CHAINS[chainId];
}

/**
 * Squads multisig configuration
 */
export interface SquadConfig {
  /** Squad PDA address (base58) */
  squadAddress: string;
  /** Vault PDA address (base58) */
  vaultAddress: string;
  /** Member public keys (base58) */
  members: string[];
  /** Required approvals */
  threshold: number;
  /** Current transaction index */
  transactionIndex: number;
}

/**
 * Pending transaction in Squads
 */
export interface SquadTransaction {
  /** Transaction PDA address (base58) */
  address: string;
  /** Transaction index */
  index: number;
  /** Creator public key */
  creator: string;
  /** Instructions to execute */
  instructions: SquadInstruction[];
  /** Current approvals */
  approvals: SquadApproval[];
  /** Transaction status */
  status: 'pending' | 'approved' | 'executed' | 'cancelled';
}

export interface SquadInstruction {
  programId: string;
  keys: Array<{
    pubkey: string;
    isSigner: boolean;
    isWritable: boolean;
  }>;
  data: string; // base64
}

export interface SquadApproval {
  member: string;
  timestamp: number;
}

/**
 * Signing payload for Solana
 * 
 * Note: Unlike Bitcoin/EVM, Solana signatures are over the full serialized transaction,
 * not just a hash. The Squads SDK handles this internally.
 */
export interface SolanaSigningPayload {
  /** The transaction message to sign */
  message: Uint8Array;
  /** Human-readable description */
  description: string;
  /** Transaction index */
  transactionIndex: number;
  /** Squad address */
  squadAddress: string;
}

/**
 * Solana Squads Adapter
 */
export class SolanaSquadsAdapter {
  readonly provider = 'squads';
  readonly chainId: SolanaChainId;
  
  // Squads SDK client would be initialized here
  // private squads: any;
  
  constructor(chainId: SolanaChainId = 'solana-mainnet') {
    this.chainId = chainId;
    // TODO: Initialize Squads SDK
    // this.squads = Squads.endpoint(getSolanaCluster(chainId));
  }
  
  /**
   * Get supported chains
   */
  supportedChains(): string[] {
    return Object.keys(SOLANA_CHAINS);
  }
  
  /**
   * Create a new Squad (multisig)
   */
  async createSquad(params: {
    members: string[];
    threshold: number;
    name?: string;
  }): Promise<SquadConfig> {
    // TODO: Implement with Squads SDK
    // const createKey = Keypair.generate();
    // const [squadPda] = multisig.getSquadPda({ createKey: createKey.publicKey });
    // await multisig.create({ ... });
    throw new Error('Not implemented - requires @sqds/multisig SDK');
  }
  
  /**
   * Get Squad configuration
   */
  async getSquad(squadAddress: string): Promise<SquadConfig> {
    // TODO: Fetch from chain
    throw new Error('Not implemented - requires @sqds/multisig SDK');
  }
  
  /**
   * Create a transaction proposal
   */
  async createTransaction(params: {
    squadAddress: string;
    instructions: SquadInstruction[];
    memo?: string;
  }): Promise<SquadTransaction> {
    // TODO: Implement with Squads SDK
    // await multisig.createTransaction({ ... });
    throw new Error('Not implemented - requires @sqds/multisig SDK');
  }
  
  /**
   * Get transaction details
   */
  async getTransaction(
    squadAddress: string,
    transactionIndex: number
  ): Promise<SquadTransaction> {
    // TODO: Fetch from chain
    throw new Error('Not implemented - requires @sqds/multisig SDK');
  }
  
  /**
   * Get signing payload for approval
   * 
   * In Squads, you sign an "approval" transaction, not the underlying tx directly.
   */
  async getSigningPayload(
    squadAddress: string,
    transactionIndex: number
  ): Promise<{
    digest: string;
    raw: {
      solana: {
        transaction: string; // Base64 serialized transaction
        squadAddress: string;
        transactionIndex: number;
      };
    };
    message: string;
  }> {
    // TODO: Build the approval transaction and return its message for signing
    // The digest would be the transaction message hash (for ed25519 signing)
    throw new Error('Not implemented - requires @sqds/multisig SDK');
  }
  
  /**
   * Submit approval (signature)
   * 
   * In Squads, each approval is a separate on-chain transaction.
   */
  async submitApproval(params: {
    squadAddress: string;
    transactionIndex: number;
    memberPubkey: string;
    signature: string; // ed25519 signature (128 hex chars / 64 bytes)
  }): Promise<{
    approvalCount: number;
    threshold: number;
    canExecute: boolean;
  }> {
    // TODO: Submit approval transaction
    // await multisig.approveTransaction({ ... });
    throw new Error('Not implemented - requires @sqds/multisig SDK');
  }
  
  /**
   * Execute transaction (when threshold reached)
   */
  async executeTransaction(params: {
    squadAddress: string;
    transactionIndex: number;
  }): Promise<{
    txSignature: string;
    success: boolean;
  }> {
    // TODO: Execute the transaction
    // await multisig.executeTransaction({ ... });
    throw new Error('Not implemented - requires @sqds/multisig SDK');
  }
  
  /**
   * Verify an ed25519 signature
   */
  async verifySignature(
    message: Uint8Array,
    signature: string,
    publicKey: string
  ): Promise<boolean> {
    // TODO: Use @noble/ed25519 or tweetnacl for verification
    throw new Error('Not implemented');
  }
}

/**
 * Create Solana Squads adapter
 */
export function createSolanaSquadsAdapter(
  chainId: SolanaChainId = 'solana-mainnet'
): SolanaSquadsAdapter {
  return new SolanaSquadsAdapter(chainId);
}

/**
 * Key differences from Bitcoin/EVM:
 * 
 * 1. Signature Algorithm:
 *    - Bitcoin: secp256k1 Schnorr (BIP-340)
 *    - Ethereum: secp256k1 ECDSA
 *    - Solana: ed25519 (EdDSA)
 * 
 * 2. Signature Size:
 *    - Bitcoin Schnorr: 64 bytes
 *    - Ethereum ECDSA: 65 bytes (r, s, v)
 *    - Solana ed25519: 64 bytes
 * 
 * 3. Coordination Model:
 *    - Bitcoin: Aggregate signatures into PSBT witness
 *    - Ethereum: Collect signatures, call execTransaction()
 *    - Solana: Each approval is a separate tx, then execute
 * 
 * 4. Address Format:
 *    - Bitcoin: bc1p... (bech32m)
 *    - Ethereum: 0x... (hex)
 *    - Solana: Base58 (32 bytes)
 */
