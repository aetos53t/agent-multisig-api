/**
 * EVM Safe Adapter
 * 
 * Wraps Safe (Gnosis Safe) SDK for EVM multisig operations.
 * Safe is a smart contract wallet - each vault requires contract deployment.
 * 
 * Flow:
 * 1. Deploy Safe with owner pubkeys + threshold
 * 2. Create transaction → get safeTxHash
 * 3. Owners sign safeTxHash via EIP-712 typed data
 * 4. Collect signatures off-chain
 * 5. Once threshold met → call execTransaction on Safe contract
 * 
 * Docs: https://docs.safe.global/sdk/overview
 */

import { keccak256, encodePacked, encodeAbiParameters, parseAbiParameters, recoverAddress, concat, toHex, pad, hexToBigInt } from 'viem';
import type { 
  Agent, 
  ChainId, 
  WalletProvider,
  SigningPayload,
} from '../types';

// ═══════════════════════════════════════════════════════════════════
//                         EVM CHAIN CONFIG
// ═══════════════════════════════════════════════════════════════════

/**
 * Map our ChainId to Safe SDK chain IDs (numeric)
 * https://docs.safe.global/safe-smart-account/supported-networks
 */
export const EVM_CHAIN_IDS: Record<string, bigint> = {
  'ethereum': 1n,
  'base': 8453n,
  'arbitrum': 42161n,
};

export const EVM_RPC_URLS: Record<string, string> = {
  'ethereum': 'https://eth.llamarpc.com',
  'base': 'https://mainnet.base.org',
  'arbitrum': 'https://arb1.arbitrum.io/rpc',
};

/** Safe Transaction Service URLs */
export const SAFE_TX_SERVICE_URLS: Record<string, string> = {
  'ethereum': 'https://safe-transaction-mainnet.safe.global',
  'base': 'https://safe-transaction-base.safe.global',
  'arbitrum': 'https://safe-transaction-arbitrum.safe.global',
};

/** Safe Singleton (v1.3.0) addresses - same across EVM chains */
export const SAFE_ADDRESSES = {
  singleton: '0xd9Db270c1B5E3Bd161E8c8503c55cEABeE709552' as const,
  singletonL2: '0x3E5c63644E683549055b9Be8653de26E0B4CD36E' as const,
  proxyFactory: '0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2' as const,
  fallbackHandler: '0xf48f2B2d2a534e402487b3ee7C18c33Aec0Fe5e4' as const,
};

export function isEVMChain(chainId: ChainId): boolean {
  return chainId === 'ethereum' || chainId === 'base' || chainId === 'arbitrum';
}

export function getNumericChainId(chainId: ChainId): bigint {
  const id = EVM_CHAIN_IDS[chainId];
  if (!id) throw new Error(`Chain ${chainId} not supported for EVM`);
  return id;
}

// ═══════════════════════════════════════════════════════════════════
//                         SAFE TYPES
// ═══════════════════════════════════════════════════════════════════

export interface SafeTransactionData {
  to: `0x${string}`;
  value: string;
  data: `0x${string}`;
  operation: 0 | 1;           // 0 = Call, 1 = DelegateCall
  safeTxGas: string;
  baseGas: string;
  gasPrice: string;
  gasToken: `0x${string}`;
  refundReceiver: `0x${string}`;
  nonce: number;
}

export interface SafeSignature {
  signer: `0x${string}`;
  data: `0x${string}`;
  isContractSignature: boolean;
}

export interface SafeMultisigConfig {
  owners: `0x${string}`[];
  threshold: number;
  saltNonce?: string;
}

export interface SafeDeploymentResult {
  safeAddress: `0x${string}`;
  deploymentTxHash?: `0x${string}`;
  isDeployed: boolean;
  predictedAddress: `0x${string}`;
}

export interface SafeProposalData {
  safeTxHash: `0x${string}`;
  safeAddress: `0x${string}`;
  chainId: bigint;
  nonce: number;
  txData: SafeTransactionData;
  typedData: EIP712TypedData;
}

export interface EIP712TypedData {
  domain: {
    name: string;
    version: string;
    chainId: bigint;
    verifyingContract: `0x${string}`;
  };
  types: {
    EIP712Domain: Array<{ name: string; type: string }>;
    SafeTx: Array<{ name: string; type: string }>;
  };
  primaryType: 'SafeTx';
  message: Record<string, unknown>;
}

// ═══════════════════════════════════════════════════════════════════
//                     SAFE TX HASH COMPUTATION
// ═══════════════════════════════════════════════════════════════════

const SAFE_TX_TYPEHASH = keccak256(
  encodePacked(
    ['string'],
    ['SafeTx(address to,uint256 value,bytes data,uint8 operation,uint256 safeTxGas,uint256 baseGas,uint256 gasPrice,address gasToken,address refundReceiver,uint256 nonce)']
  )
);

const DOMAIN_SEPARATOR_TYPEHASH = keccak256(
  encodePacked(
    ['string'],
    ['EIP712Domain(uint256 chainId,address verifyingContract)']
  )
);

/**
 * Compute Safe domain separator
 */
export function computeDomainSeparator(
  chainId: bigint,
  safeAddress: `0x${string}`
): `0x${string}` {
  return keccak256(
    encodeAbiParameters(
      parseAbiParameters('bytes32, uint256, address'),
      [DOMAIN_SEPARATOR_TYPEHASH, chainId, safeAddress]
    )
  );
}

/**
 * Compute Safe transaction hash (what signers sign)
 */
export function computeSafeTxHash(
  safeAddress: `0x${string}`,
  chainId: bigint,
  txData: SafeTransactionData
): `0x${string}` {
  // Hash the data field
  const dataHash = keccak256(txData.data);
  
  // Encode the struct hash
  const safeTxStructHash = keccak256(
    encodeAbiParameters(
      parseAbiParameters('bytes32, address, uint256, bytes32, uint8, uint256, uint256, uint256, address, address, uint256'),
      [
        SAFE_TX_TYPEHASH,
        txData.to,
        BigInt(txData.value),
        dataHash,
        txData.operation,
        BigInt(txData.safeTxGas),
        BigInt(txData.baseGas),
        BigInt(txData.gasPrice),
        txData.gasToken,
        txData.refundReceiver,
        BigInt(txData.nonce),
      ]
    )
  );
  
  // Compute domain separator
  const domainSeparator = computeDomainSeparator(chainId, safeAddress);
  
  // Final EIP-712 hash
  return keccak256(
    concat([
      '0x1901' as `0x${string}`,
      domainSeparator,
      safeTxStructHash,
    ])
  );
}

// ═══════════════════════════════════════════════════════════════════
//                   SAFE ADDRESS PREDICTION
// ═══════════════════════════════════════════════════════════════════

/**
 * Compute Safe proxy deployment initializer data
 */
function computeInitializer(
  owners: `0x${string}`[],
  threshold: number
): `0x${string}` {
  // Safe.setup(owners, threshold, to, data, fallbackHandler, paymentToken, payment, paymentReceiver)
  const setupFunctionSelector = '0xb63e800d';
  
  const encoded = encodeAbiParameters(
    parseAbiParameters('address[], uint256, address, bytes, address, address, uint256, address'),
    [
      owners,
      BigInt(threshold),
      '0x0000000000000000000000000000000000000000', // to
      '0x',                                          // data
      SAFE_ADDRESSES.fallbackHandler,                // fallbackHandler
      '0x0000000000000000000000000000000000000000', // paymentToken
      0n,                                            // payment
      '0x0000000000000000000000000000000000000000', // paymentReceiver
    ]
  );
  
  return (setupFunctionSelector + encoded.slice(2)) as `0x${string}`;
}

/**
 * Predict Safe address before deployment (CREATE2)
 */
export function predictSafeAddress(
  config: SafeMultisigConfig,
  chainId: ChainId
): `0x${string}` {
  const { owners, threshold, saltNonce = '0' } = config;
  
  // Sort owners for determinism
  const sortedOwners = [...owners].sort((a, b) => 
    a.toLowerCase().localeCompare(b.toLowerCase())
  ) as `0x${string}`[];
  
  // Compute initializer
  const initializer = computeInitializer(sortedOwners, threshold);
  
  // Use L2 singleton for L2s, regular for mainnet
  const singleton = chainId === 'ethereum' 
    ? SAFE_ADDRESSES.singleton 
    : SAFE_ADDRESSES.singletonL2;
  
  // Salt = keccak256(keccak256(initializer) + saltNonce)
  const salt = keccak256(
    concat([
      keccak256(initializer),
      pad(toHex(BigInt(saltNonce)), { size: 32 }),
    ])
  );
  
  // Proxy creation code (minimal proxy pointing to singleton)
  // This is the EIP-1167 minimal proxy bytecode
  const proxyCreationCode = concat([
    '0x3d602d80600a3d3981f3363d3d373d3d3d363d73' as `0x${string}`,
    singleton,
    '0x5af43d82803e903d91602b57fd5bf3' as `0x${string}`,
  ]);
  
  const initCodeHash = keccak256(
    concat([proxyCreationCode, initializer])
  );
  
  // CREATE2 address = keccak256(0xff ++ factory ++ salt ++ initCodeHash)[12:]
  const create2Hash = keccak256(
    concat([
      '0xff' as `0x${string}`,
      SAFE_ADDRESSES.proxyFactory,
      salt,
      initCodeHash,
    ])
  );
  
  return ('0x' + create2Hash.slice(26)) as `0x${string}`;
}

// ═══════════════════════════════════════════════════════════════════
//                       SAFE ADAPTER CLASS
// ═══════════════════════════════════════════════════════════════════

/**
 * EVM Safe Adapter
 * 
 * Handles Safe address prediction, tx creation, and signature collection.
 * Does NOT hold private keys - just coordinates.
 */
export class EVMSafeAdapter {
  private chainId: ChainId;
  private numericChainId: bigint;
  private rpcUrl: string;
  private txServiceUrl: string;
  
  constructor(chainId: ChainId) {
    if (!isEVMChain(chainId)) {
      throw new Error(`Chain ${chainId} is not an EVM chain`);
    }
    this.chainId = chainId;
    this.numericChainId = EVM_CHAIN_IDS[chainId];
    this.rpcUrl = EVM_RPC_URLS[chainId];
    this.txServiceUrl = SAFE_TX_SERVICE_URLS[chainId];
  }
  
  /**
   * Predict Safe address before deployment
   * Uses CREATE2 - same inputs always produce same address
   */
  predictAddress(config: SafeMultisigConfig): `0x${string}` {
    return predictSafeAddress(config, this.chainId);
  }
  
  /**
   * Check if a Safe is already deployed at address
   */
  async isSafeDeployed(address: `0x${string}`): Promise<boolean> {
    try {
      const response = await fetch(this.rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_getCode',
          params: [address, 'latest'],
          id: 1,
        }),
      });
      const data = await response.json() as { result: string };
      return data.result !== '0x' && data.result.length > 2;
    } catch {
      return false;
    }
  }
  
  /**
   * Get next nonce for a Safe
   */
  async getSafeNonce(safeAddress: `0x${string}`): Promise<number> {
    try {
      // Call nonce() on Safe contract
      const response = await fetch(this.rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_call',
          params: [{
            to: safeAddress,
            data: '0xaffed0e0', // nonce() selector
          }, 'latest'],
          id: 1,
        }),
      });
      const data = await response.json() as { result: string };
      return Number(hexToBigInt(data.result as `0x${string}`));
    } catch {
      return 0;
    }
  }
  
  /**
   * Create a transaction proposal
   * Returns the safeTxHash and EIP-712 typed data for signing
   */
  async createProposal(
    safeAddress: `0x${string}`,
    to: `0x${string}`,
    value: string,
    data: `0x${string}` = '0x',
    operation: 0 | 1 = 0
  ): Promise<SafeProposalData> {
    const nonce = await this.getSafeNonce(safeAddress);
    
    const txData: SafeTransactionData = {
      to,
      value,
      data,
      operation,
      safeTxGas: '0',
      baseGas: '0',
      gasPrice: '0',
      gasToken: '0x0000000000000000000000000000000000000000',
      refundReceiver: '0x0000000000000000000000000000000000000000',
      nonce,
    };
    
    const safeTxHash = computeSafeTxHash(safeAddress, this.numericChainId, txData);
    
    const typedData = buildSafeTypedData(safeAddress, this.numericChainId, txData);
    
    return {
      safeTxHash,
      safeAddress,
      chainId: this.numericChainId,
      nonce,
      txData,
      typedData,
    };
  }
  
  /**
   * Verify a signature is valid for a safeTxHash
   */
  async verifySignature(
    safeTxHash: `0x${string}`,
    signature: `0x${string}`,
    expectedSigner: `0x${string}`
  ): Promise<boolean> {
    try {
      // Adjust v value if needed (Safe uses v = {0,1} + 27)
      let sig = signature;
      const v = parseInt(signature.slice(-2), 16);
      if (v < 27) {
        sig = (signature.slice(0, -2) + (v + 27).toString(16)) as `0x${string}`;
      }
      
      const recovered = await recoverAddress({
        hash: safeTxHash,
        signature: sig,
      });
      
      return recovered.toLowerCase() === expectedSigner.toLowerCase();
    } catch {
      return false;
    }
  }
  
  /**
   * Build signing payload for an agent
   */
  buildSigningPayload(
    proposal: SafeProposalData,
    agent: Agent,
    proposalId: string
  ): SigningPayload {
    return {
      proposalId,
      agentId: agent.id,
      chainId: this.chainId,
      digest: proposal.safeTxHash,
      message: `Sign Safe transaction on ${this.chainId}`,
      outputs: [{
        address: proposal.txData.to,
        amount: BigInt(proposal.txData.value || '0'),
      }],
      totalInput: 0n,
      totalOutput: BigInt(proposal.txData.value || '0'),
      fee: 0n,
      raw: {
        evm: {
          domain: proposal.typedData.domain as unknown as Record<string, unknown>,
          types: proposal.typedData.types as unknown as Record<string, unknown>,
          value: proposal.typedData.message,
        }
      }
    };
  }
  
  /**
   * Propose transaction to Safe Transaction Service
   */
  async proposeToService(
    safeAddress: `0x${string}`,
    proposal: SafeProposalData,
    senderAddress: `0x${string}`,
    signature: `0x${string}`
  ): Promise<void> {
    const payload = {
      to: proposal.txData.to,
      value: proposal.txData.value,
      data: proposal.txData.data || null,
      operation: proposal.txData.operation,
      safeTxGas: proposal.txData.safeTxGas,
      baseGas: proposal.txData.baseGas,
      gasPrice: proposal.txData.gasPrice,
      gasToken: proposal.txData.gasToken,
      refundReceiver: proposal.txData.refundReceiver,
      nonce: proposal.nonce,
      contractTransactionHash: proposal.safeTxHash,
      sender: senderAddress,
      signature,
    };
    
    const response = await fetch(
      `${this.txServiceUrl}/api/v1/safes/${safeAddress}/multisig-transactions/`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }
    );
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to propose transaction: ${error}`);
    }
  }
  
  /**
   * Add confirmation (signature) to existing proposal on Safe Transaction Service
   */
  async confirmOnService(
    safeTxHash: `0x${string}`,
    signature: `0x${string}`
  ): Promise<void> {
    const response = await fetch(
      `${this.txServiceUrl}/api/v1/multisig-transactions/${safeTxHash}/confirmations/`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signature }),
      }
    );
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to confirm transaction: ${error}`);
    }
  }
  
  /**
   * Get transaction details from Safe Transaction Service
   */
  async getTransactionFromService(
    safeTxHash: `0x${string}`
  ): Promise<{
    confirmations: Array<{ owner: string; signature: string }>;
    confirmationsRequired: number;
    isExecuted: boolean;
  } | null> {
    try {
      const response = await fetch(
        `${this.txServiceUrl}/api/v1/multisig-transactions/${safeTxHash}/`
      );
      
      if (!response.ok) return null;
      
      const data = await response.json() as {
        confirmations: Array<{ owner: string; signature: string }>;
        confirmationsRequired: number;
        isExecuted: boolean;
      };
      
      return data;
    } catch {
      return null;
    }
  }
}

// ═══════════════════════════════════════════════════════════════════
//                        HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════

/**
 * Build EIP-712 typed data for Safe transaction
 */
export function buildSafeTypedData(
  safeAddress: `0x${string}`,
  chainId: bigint,
  txData: SafeTransactionData
): EIP712TypedData {
  return {
    domain: {
      name: 'Safe',
      version: '1.3.0',
      chainId,
      verifyingContract: safeAddress,
    },
    types: {
      EIP712Domain: [
        { name: 'chainId', type: 'uint256' },
        { name: 'verifyingContract', type: 'address' },
      ],
      SafeTx: [
        { name: 'to', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'data', type: 'bytes' },
        { name: 'operation', type: 'uint8' },
        { name: 'safeTxGas', type: 'uint256' },
        { name: 'baseGas', type: 'uint256' },
        { name: 'gasPrice', type: 'uint256' },
        { name: 'gasToken', type: 'address' },
        { name: 'refundReceiver', type: 'address' },
        { name: 'nonce', type: 'uint256' },
      ],
    },
    primaryType: 'SafeTx',
    message: {
      to: txData.to,
      value: txData.value,
      data: txData.data,
      operation: txData.operation,
      safeTxGas: txData.safeTxGas,
      baseGas: txData.baseGas,
      gasPrice: txData.gasPrice,
      gasToken: txData.gasToken,
      refundReceiver: txData.refundReceiver,
      nonce: txData.nonce,
    },
  };
}

/**
 * Encode signatures for Safe execTransaction
 * Signatures must be sorted by signer address (ascending)
 */
export function encodeSignatures(signatures: SafeSignature[]): `0x${string}` {
  // Sort by signer address (ascending, lowercase comparison)
  const sorted = [...signatures].sort((a, b) => 
    a.signer.toLowerCase().localeCompare(b.signer.toLowerCase())
  );
  
  // Concatenate signature bytes
  // ECDSA: r (32) + s (32) + v (1) = 65 bytes each
  const encoded = sorted.map(sig => sig.data.slice(2)).join('');
  return ('0x' + encoded) as `0x${string}`;
}

/**
 * Create a Safe adapter for a specific chain
 */
export function createEVMSafeAdapter(chainId: ChainId): EVMSafeAdapter {
  return new EVMSafeAdapter(chainId);
}
