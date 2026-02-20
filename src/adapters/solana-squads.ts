/**
 * Solana Squads Adapter
 * 
 * Wraps the Squads Protocol v4 for Solana multisig operations.
 * 
 * Key concepts:
 * - Squads uses PDAs (Program Derived Addresses) for multisig accounts
 * - Signatures are ed25519 (64 bytes) - DIFFERENT from Bitcoin/Ethereum!
 * - Transactions are approved individually, then executed when threshold met
 * 
 * @see https://docs.squads.so/
 * @see https://github.com/Squads-Protocol/v4
 */

import { 
  Connection, 
  PublicKey, 
  Transaction,
  Keypair,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import * as multisig from '@sqds/multisig';

// ═══════════════════════════════════════════════════════════════════
//                          CHAIN CONFIG
// ═══════════════════════════════════════════════════════════════════

export const SOLANA_CHAINS = {
  'solana-mainnet': 'mainnet-beta',
  'solana-devnet': 'devnet',
} as const;

export type SolanaChainId = keyof typeof SOLANA_CHAINS;

export const SOLANA_RPC_URLS: Record<SolanaChainId, string> = {
  'solana-mainnet': 'https://api.mainnet-beta.solana.com',
  'solana-devnet': 'https://api.devnet.solana.com',
};

export function isSolanaChain(chainId: string): chainId is SolanaChainId {
  return chainId in SOLANA_CHAINS;
}

export function getSolanaCluster(chainId: SolanaChainId): string {
  return SOLANA_CHAINS[chainId];
}

// ═══════════════════════════════════════════════════════════════════
//                              TYPES
// ═══════════════════════════════════════════════════════════════════

export interface SquadsConfig {
  /** Multisig PDA address (base58) */
  multisigAddress: string;
  /** Create key that was used (for PDA derivation) */
  createKey: string;
  /** Member public keys (base58) */
  members: string[];
  /** Required approvals */
  threshold: number;
  /** Current transaction index */
  transactionIndex: bigint;
}

export interface SquadsProposal {
  /** Vault transaction PDA */
  vaultTransactionAddress: string;
  /** Transaction index */
  transactionIndex: bigint;
  /** Creator */
  creator: string;
  /** Proposal PDA (for voting) */
  proposalAddress: string;
  /** Current approvals */
  approvals: string[];
  /** Status */
  status: 'active' | 'approved' | 'executed' | 'cancelled' | 'rejected';
}

// ═══════════════════════════════════════════════════════════════════
//                         ADAPTER CLASS
// ═══════════════════════════════════════════════════════════════════

export class SolanaSquadsAdapter {
  private connection: Connection;
  readonly chainId: SolanaChainId;
  
  constructor(chainId: SolanaChainId = 'solana-mainnet') {
    this.chainId = chainId;
    this.connection = new Connection(SOLANA_RPC_URLS[chainId], 'confirmed');
  }
  
  /**
   * Predict multisig address from a create key
   * Squads uses PDAs - same inputs always produce same address
   */
  predictMultisigAddress(createKey: string): string {
    const createKeyPubkey = new PublicKey(createKey);
    const [multisigPda] = multisig.getMultisigPda({ createKey: createKeyPubkey });
    return multisigPda.toBase58();
  }
  
  /**
   * Predict vault address (where funds are held)
   */
  predictVaultAddress(multisigAddress: string, vaultIndex = 0): string {
    const multisigPda = new PublicKey(multisigAddress);
    const [vaultPda] = multisig.getVaultPda({ 
      multisigPda, 
      index: vaultIndex 
    });
    return vaultPda.toBase58();
  }
  
  /**
   * Get multisig account info
   */
  async getMultisig(multisigAddress: string): Promise<SquadsConfig | null> {
    try {
      const multisigPda = new PublicKey(multisigAddress);
      const multisigAccount = await multisig.accounts.Multisig.fromAccountAddress(
        this.connection,
        multisigPda
      );
      
      return {
        multisigAddress,
        createKey: multisigAccount.createKey.toBase58(),
        members: multisigAccount.members.map(m => m.key.toBase58()),
        threshold: multisigAccount.threshold,
        transactionIndex: multisigAccount.transactionIndex,
      };
    } catch (e) {
      return null;
    }
  }
  
  /**
   * Check if multisig exists on chain
   */
  async isMultisigDeployed(multisigAddress: string): Promise<boolean> {
    const info = await this.getMultisig(multisigAddress);
    return info !== null;
  }
  
  /**
   * Get vault balance in lamports
   */
  async getVaultBalance(multisigAddress: string, vaultIndex = 0): Promise<bigint> {
    const vaultAddress = this.predictVaultAddress(multisigAddress, vaultIndex);
    const balance = await this.connection.getBalance(new PublicKey(vaultAddress));
    return BigInt(balance);
  }
  
  /**
   * Build transaction to create a new Squads multisig
   * 
   * Note: This returns the transaction - caller must sign with the createKey
   * and a fee payer, then broadcast.
   */
  async buildCreateMultisigTx(params: {
    createKey: string;  // Random keypair pubkey for deterministic PDA
    members: string[];  // Member pubkeys (base58)
    threshold: number;
    feePayer: string;
  }): Promise<{
    transaction: string;  // Base64 serialized
    multisigAddress: string;
    vaultAddress: string;
  }> {
    const { createKey, members, threshold, feePayer } = params;
    
    const createKeyPubkey = new PublicKey(createKey);
    const feePayerPubkey = new PublicKey(feePayer);
    
    const [multisigPda] = multisig.getMultisigPda({ createKey: createKeyPubkey });
    const [vaultPda] = multisig.getVaultPda({ multisigPda, index: 0 });
    
    // Build the create instruction
    const createIx = multisig.instructions.multisigCreateV2({
      createKey: createKeyPubkey,
      creator: feePayerPubkey,
      multisigPda,
      configAuthority: null,
      timeLock: 0,
      members: members.map(m => ({
        key: new PublicKey(m),
        permissions: multisig.types.Permissions.all(),
      })),
      threshold,
      rentCollector: null,
      treasury: feePayerPubkey,
      programId: multisig.PROGRAM_ID,
    });
    
    const tx = new Transaction().add(createIx);
    tx.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash;
    tx.feePayer = feePayerPubkey;
    
    return {
      transaction: tx.serialize({ requireAllSignatures: false }).toString('base64'),
      multisigAddress: multisigPda.toBase58(),
      vaultAddress: vaultPda.toBase58(),
    };
  }
  
  /**
   * Build a vault transfer transaction proposal
   */
  async buildTransferProposal(params: {
    multisigAddress: string;
    destination: string;
    amount: bigint;  // in lamports
    creator: string;
    memo?: string;
  }): Promise<{
    transaction: string;
    vaultTransactionAddress: string;
    proposalAddress: string;
    transactionIndex: bigint;
  }> {
    const { multisigAddress, destination, amount, creator, memo } = params;
    
    const multisigPda = new PublicKey(multisigAddress);
    const creatorPubkey = new PublicKey(creator);
    const destinationPubkey = new PublicKey(destination);
    
    // Get current transaction index
    const multisigAccount = await multisig.accounts.Multisig.fromAccountAddress(
      this.connection,
      multisigPda
    );
    const transactionIndex = multisigAccount.transactionIndex + 1n;
    
    const [vaultPda] = multisig.getVaultPda({ multisigPda, index: 0 });
    const [vaultTransactionPda] = multisig.getTransactionPda({
      multisigPda,
      index: transactionIndex,
    });
    const [proposalPda] = multisig.getProposalPda({
      multisigPda,
      transactionIndex,
    });
    
    // Create the vault transaction (SOL transfer)
    const transferIx = SystemProgram.transfer({
      fromPubkey: vaultPda,
      toPubkey: destinationPubkey,
      lamports: Number(amount),
    });
    
    const createVaultTxIx = multisig.instructions.vaultTransactionCreate({
      multisigPda,
      transactionIndex,
      creator: creatorPubkey,
      vaultIndex: 0,
      ephemeralSigners: 0,
      transactionMessage: new multisig.TransactionMessage({
        payerKey: vaultPda,
        recentBlockhash: (await this.connection.getLatestBlockhash()).blockhash,
        instructions: [transferIx],
      }),
      memo,
      programId: multisig.PROGRAM_ID,
    });
    
    // Create proposal for voting
    const createProposalIx = multisig.instructions.proposalCreate({
      multisigPda,
      transactionIndex,
      creator: creatorPubkey,
      programId: multisig.PROGRAM_ID,
    });
    
    // Auto-approve by creator
    const approveIx = multisig.instructions.proposalApprove({
      multisigPda,
      transactionIndex,
      member: creatorPubkey,
      programId: multisig.PROGRAM_ID,
    });
    
    const tx = new Transaction()
      .add(createVaultTxIx)
      .add(createProposalIx)
      .add(approveIx);
    
    tx.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash;
    tx.feePayer = creatorPubkey;
    
    return {
      transaction: tx.serialize({ requireAllSignatures: false }).toString('base64'),
      vaultTransactionAddress: vaultTransactionPda.toBase58(),
      proposalAddress: proposalPda.toBase58(),
      transactionIndex,
    };
  }
  
  /**
   * Build approval transaction
   */
  async buildApprovalTx(params: {
    multisigAddress: string;
    transactionIndex: bigint;
    member: string;
  }): Promise<{
    transaction: string;
    proposalAddress: string;
  }> {
    const { multisigAddress, transactionIndex, member } = params;
    
    const multisigPda = new PublicKey(multisigAddress);
    const memberPubkey = new PublicKey(member);
    
    const [proposalPda] = multisig.getProposalPda({
      multisigPda,
      transactionIndex,
    });
    
    const approveIx = multisig.instructions.proposalApprove({
      multisigPda,
      transactionIndex,
      member: memberPubkey,
      programId: multisig.PROGRAM_ID,
    });
    
    const tx = new Transaction().add(approveIx);
    tx.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash;
    tx.feePayer = memberPubkey;
    
    return {
      transaction: tx.serialize({ requireAllSignatures: false }).toString('base64'),
      proposalAddress: proposalPda.toBase58(),
    };
  }
  
  /**
   * Build execute transaction (when threshold is met)
   */
  async buildExecuteTx(params: {
    multisigAddress: string;
    transactionIndex: bigint;
    member: string;
  }): Promise<{
    transaction: string;
  }> {
    const { multisigAddress, transactionIndex, member } = params;
    
    const multisigPda = new PublicKey(multisigAddress);
    const memberPubkey = new PublicKey(member);
    
    const [vaultPda] = multisig.getVaultPda({ multisigPda, index: 0 });
    const [vaultTransactionPda] = multisig.getTransactionPda({
      multisigPda,
      index: transactionIndex,
    });
    
    const executeIx = multisig.instructions.vaultTransactionExecute({
      multisigPda,
      transactionIndex,
      member: memberPubkey,
      programId: multisig.PROGRAM_ID,
    });
    
    const tx = new Transaction().add(executeIx);
    tx.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash;
    tx.feePayer = memberPubkey;
    
    return {
      transaction: tx.serialize({ requireAllSignatures: false }).toString('base64'),
    };
  }
  
  /**
   * Get proposal status
   */
  async getProposalStatus(
    multisigAddress: string,
    transactionIndex: bigint
  ): Promise<SquadsProposal | null> {
    try {
      const multisigPda = new PublicKey(multisigAddress);
      
      const [vaultTransactionPda] = multisig.getTransactionPda({
        multisigPda,
        index: transactionIndex,
      });
      
      const [proposalPda] = multisig.getProposalPda({
        multisigPda,
        transactionIndex,
      });
      
      const proposalAccount = await multisig.accounts.Proposal.fromAccountAddress(
        this.connection,
        proposalPda
      );
      
      // Decode status
      let status: SquadsProposal['status'] = 'active';
      if ('approved' in proposalAccount.status) status = 'approved';
      else if ('executed' in proposalAccount.status) status = 'executed';
      else if ('cancelled' in proposalAccount.status) status = 'cancelled';
      else if ('rejected' in proposalAccount.status) status = 'rejected';
      
      return {
        vaultTransactionAddress: vaultTransactionPda.toBase58(),
        transactionIndex,
        creator: proposalPda.toBase58(), // Would need to fetch from tx
        proposalAddress: proposalPda.toBase58(),
        approvals: proposalAccount.approved.map(pk => pk.toBase58()),
        status,
      };
    } catch (e) {
      return null;
    }
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
 * 2. Coordination Model:
 *    - Bitcoin: Aggregate signatures into PSBT witness, then broadcast
 *    - Ethereum: Collect signatures off-chain, call execTransaction()
 *    - Solana: Each approval is a separate on-chain tx, then execute tx
 * 
 * 3. Address Format:
 *    - Bitcoin: bc1p... (bech32m)
 *    - Ethereum: 0x... (hex, 40 chars)
 *    - Solana: Base58 (44 chars typically)
 * 
 * 4. Deployment:
 *    - Bitcoin: No deployment needed, address derived from keys
 *    - Ethereum: Safe must be deployed (contract), but address is predictable
 *    - Solana: Squads must be created (on-chain state), address is PDA
 */
