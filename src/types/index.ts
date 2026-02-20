/**
 * Core types for Agent Multisig Coordination API
 * 
 * Designed for cross-chain compatibility from day one.
 * Bitcoin (P2TR) is the primary implementation, but all types
 * should accommodate Stacks, EVM, and future chains.
 */

// ═══════════════════════════════════════════════════════════════════
//                              CHAINS
// ═══════════════════════════════════════════════════════════════════

export type ChainId = 
  | 'bitcoin-mainnet'
  | 'bitcoin-testnet'
  | 'bitcoin-signet'
  | 'stacks-mainnet'
  | 'stacks-testnet'
  | 'ethereum'
  | 'base'
  | 'arbitrum';

export type ChainType = 'utxo' | 'account';

export type SignatureScheme = 'schnorr' | 'ecdsa';

export interface ChainConfig {
  chainId: ChainId;
  type: ChainType;
  signatureScheme: SignatureScheme;
  addressPrefix: string;
  explorerUrl: string;
  mempoolApiUrl?: string;
}

export const CHAIN_CONFIGS: Record<ChainId, ChainConfig> = {
  'bitcoin-mainnet': {
    chainId: 'bitcoin-mainnet',
    type: 'utxo',
    signatureScheme: 'schnorr',
    addressPrefix: 'bc1p',
    explorerUrl: 'https://mempool.space',
    mempoolApiUrl: 'https://mempool.space/api',
  },
  'bitcoin-testnet': {
    chainId: 'bitcoin-testnet',
    type: 'utxo',
    signatureScheme: 'schnorr',
    addressPrefix: 'tb1p',
    explorerUrl: 'https://mempool.space/testnet',
    mempoolApiUrl: 'https://mempool.space/testnet/api',
  },
  'bitcoin-signet': {
    chainId: 'bitcoin-signet',
    type: 'utxo',
    signatureScheme: 'schnorr',
    addressPrefix: 'tb1p',
    explorerUrl: 'https://mempool.space/signet',
    mempoolApiUrl: 'https://mempool.space/signet/api',
  },
  'stacks-mainnet': {
    chainId: 'stacks-mainnet',
    type: 'account',
    signatureScheme: 'ecdsa',
    addressPrefix: 'SP',
    explorerUrl: 'https://explorer.stacks.co',
  },
  'stacks-testnet': {
    chainId: 'stacks-testnet',
    type: 'account',
    signatureScheme: 'ecdsa',
    addressPrefix: 'ST',
    explorerUrl: 'https://explorer.stacks.co/?chain=testnet',
  },
  'ethereum': {
    chainId: 'ethereum',
    type: 'account',
    signatureScheme: 'ecdsa',
    addressPrefix: '0x',
    explorerUrl: 'https://etherscan.io',
  },
  'base': {
    chainId: 'base',
    type: 'account',
    signatureScheme: 'ecdsa',
    addressPrefix: '0x',
    explorerUrl: 'https://basescan.org',
  },
  'arbitrum': {
    chainId: 'arbitrum',
    type: 'account',
    signatureScheme: 'ecdsa',
    addressPrefix: '0x',
    explorerUrl: 'https://arbiscan.io',
  },
};

// ═══════════════════════════════════════════════════════════════════
//                           WALLET PROVIDERS
// ═══════════════════════════════════════════════════════════════════

export type WalletProvider = 
  | 'aibtc'
  | 'agentkit'
  | 'crossmint'
  | 'clawcash'
  | 'bankr'
  | 'custom';

export interface WalletProviderConfig {
  provider: WalletProvider;
  displayName: string;
  supportedChains: ChainId[];
  supportsRawSigning: boolean;
  apiDocsUrl?: string;
}

export const WALLET_PROVIDERS: Record<WalletProvider, WalletProviderConfig> = {
  'aibtc': {
    provider: 'aibtc',
    displayName: 'AIBTC',
    supportedChains: ['bitcoin-mainnet', 'bitcoin-testnet', 'stacks-mainnet', 'stacks-testnet'],
    supportsRawSigning: true, // TBD - need to verify
    apiDocsUrl: 'https://github.com/aibtcdev/ai-agent-crew',
  },
  'agentkit': {
    provider: 'agentkit',
    displayName: 'Coinbase AgentKit',
    supportedChains: ['ethereum', 'base', 'bitcoin-mainnet'],
    supportsRawSigning: true, // TBD
    apiDocsUrl: 'https://docs.cdp.coinbase.com/agentkit',
  },
  'crossmint': {
    provider: 'crossmint',
    displayName: 'Crossmint',
    supportedChains: ['ethereum', 'base', 'arbitrum'],
    supportsRawSigning: true, // TBD
    apiDocsUrl: 'https://docs.crossmint.com',
  },
  'clawcash': {
    provider: 'clawcash',
    displayName: 'Claw Cash',
    supportedChains: ['bitcoin-mainnet'],
    supportsRawSigning: true,
    apiDocsUrl: 'https://clawbot.cash',
  },
  'bankr': {
    provider: 'bankr',
    displayName: 'Bankr',
    supportedChains: ['ethereum', 'base', 'arbitrum'],
    supportsRawSigning: true,
    apiDocsUrl: 'https://docs.bankr.bot',
  },
  'custom': {
    provider: 'custom',
    displayName: 'Custom',
    supportedChains: [],
    supportsRawSigning: true,
  },
};

// ═══════════════════════════════════════════════════════════════════
//                              AGENTS
// ═══════════════════════════════════════════════════════════════════

export interface Agent {
  id: string;
  name: string;
  publicKey: string;           // Hex-encoded, format depends on chain
  xOnlyPubkey?: string;        // For Taproot (32 bytes, no prefix)
  provider: WalletProvider;
  webhookUrl?: string;         // For async notifications
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface AgentCreateInput {
  id: string;
  name: string;
  publicKey: string;
  provider: WalletProvider;
  webhookUrl?: string;
  metadata?: Record<string, unknown>;
}

// ═══════════════════════════════════════════════════════════════════
//                             MULTISIGS
// ═══════════════════════════════════════════════════════════════════

export interface Multisig {
  id: string;
  name: string;
  chainId: ChainId;
  address: string;
  threshold: number;
  agents: Agent[];
  
  // Bitcoin-specific (P2TR)
  bitcoin?: {
    internalPubkey: string;
    scriptTree: TapTree;
    merkleRoot: string;
    tweakedPubkey: string;
  };
  
  // Stacks-specific (future)
  stacks?: {
    principals: string[];
  };
  
  // EVM-specific (Safe / Gnosis Safe)
  evm?: {
    owners: `0x${string}`[];
    safeVersion: string;
    isDeployed: boolean;
    saltNonce?: string;
  };
  
  createdAt: Date;
  createdBy: string;           // Agent ID
}

export interface MultisigCreateInput {
  name: string;
  chainId: ChainId;
  agents: AgentCreateInput[];
  threshold: number;
}

// ═══════════════════════════════════════════════════════════════════
//                          TAPROOT STRUCTURES
// ═══════════════════════════════════════════════════════════════════

export interface TapTree {
  leaves: TapLeaf[];
  root: string;
}

export interface TapLeaf {
  index: number;
  script: string;              // Hex-encoded Tapscript
  scriptHash: string;
  leafVersion: number;
  controlBlock: string;
  signerPubkeys: string[];     // x-only pubkeys in script order
  signerAgentIds: string[];    // Corresponding agent IDs
}

// ═══════════════════════════════════════════════════════════════════
//                            PROPOSALS
// ═══════════════════════════════════════════════════════════════════

export type ProposalStatus = 
  | 'pending'                   // Awaiting signatures
  | 'ready'                     // Threshold reached
  | 'finalized'                 // Transaction built
  | 'broadcast'                 // Submitted to network
  | 'confirmed'                 // In a block
  | 'rejected'                  // Explicitly rejected
  | 'expired';                  // Past expiration

export interface Proposal {
  id: string;
  multisigId: string;
  status: ProposalStatus;
  
  // What we're doing
  outputs: TxOutput[];
  feeRate?: number;            // For UTXO chains (sat/vB)
  fee?: number;                // Calculated fee
  
  // UTXO-specific
  inputs?: TxInput[];
  changeOutput?: TxOutput;
  
  // Signing coordination
  selectedLeafIndex?: number;  // For Taproot
  requiredSigners: string[];   // Agent IDs
  signatures: SignatureEntry[];
  
  // Transaction data
  unsignedTx: string;          // PSBT for Bitcoin, unsigned tx for others
  signedTx?: string;
  finalTx?: string;
  txid?: string;
  
  // Metadata
  note?: string;
  createdAt: Date;
  createdBy: string;
  expiresAt: Date;
}

export interface ProposalCreateInput {
  multisigId: string;
  outputs: TxOutputInput[];
  feeRate?: number;
  note?: string;
  expiresInSeconds?: number;
}

export interface TxOutput {
  address: string;
  amount: bigint;              // Smallest unit (sats, wei, etc.)
  label?: string;
}

export interface TxOutputInput {
  address: string;
  amount: string | number;     // Accept string for large numbers
  label?: string;
}

export interface TxInput {
  txid: string;
  vout: number;
  amount: bigint;
  scriptPubkey: string;
}

export interface SignatureEntry {
  agentId: string;
  publicKey: string;
  signature: string;
  signedAt: Date;
}

// ═══════════════════════════════════════════════════════════════════
//                         SIGNING PAYLOADS
// ═══════════════════════════════════════════════════════════════════

export interface SigningPayload {
  proposalId: string;
  agentId: string;
  chainId: ChainId;
  
  // What to sign
  digest: string;              // 32-byte hex hash
  
  // Human-readable context
  message: string;
  outputs: TxOutput[];
  totalInput: bigint;
  totalOutput: bigint;
  fee: bigint;
  
  // Chain-specific raw data
  raw: {
    bitcoin?: {
      psbt: string;
      inputIndex: number;
      sighashType: number;
    };
    stacks?: {
      domain: Record<string, unknown>;
      message: Record<string, unknown>;
    };
    evm?: {
      domain: Record<string, unknown>;
      types: Record<string, unknown>;
      value: Record<string, unknown>;
    };
  };
}

// ═══════════════════════════════════════════════════════════════════
//                            WEBHOOKS
// ═══════════════════════════════════════════════════════════════════

export type WebhookEvent = 
  | 'proposal.created'
  | 'proposal.signed'
  | 'proposal.ready'
  | 'proposal.finalized'
  | 'proposal.broadcast'
  | 'proposal.confirmed'
  | 'proposal.rejected'
  | 'proposal.expired';

export interface WebhookPayload {
  event: WebhookEvent;
  timestamp: Date;
  data: {
    proposalId: string;
    multisigId: string;
    multisigName: string;
    [key: string]: unknown;
  };
}

// ═══════════════════════════════════════════════════════════════════
//                           API RESPONSES
// ═══════════════════════════════════════════════════════════════════

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}
