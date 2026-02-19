/**
 * Bankr Wallet Adapter
 * 
 * Integrates with Bankr's Agent API for EVM signing.
 * Bankr provides custodial wallets for AI agents with built-in
 * EIP-712 typed data signing - perfect for Safe multisig.
 * 
 * Docs: https://docs.bankr.bot/agent-api/overview
 * Sign endpoint: https://docs.bankr.bot/agent-api/sign-endpoint
 */

import type { Agent, ChainId, WalletProvider } from '../types';
import { 
  WalletAdapter, 
  type WalletAdapterConfig, 
  type SignatureResult,
  type BalanceInfo,
  type UTXO,
  type SignDigestOptions,
} from './base';

// ═══════════════════════════════════════════════════════════════════
//                         BANKR TYPES
// ═══════════════════════════════════════════════════════════════════

export interface BankrConfig extends WalletAdapterConfig {
  provider: 'bankr';
  apiKey?: string;
  apiUrl?: string;
}

export interface BankrSignRequest {
  signatureType: 'personal_sign' | 'eth_signTypedData_v4' | 'eth_signTransaction';
  message?: string;
  typedData?: EIP712TypedData;
  transaction?: BankrTransaction;
}

export interface EIP712TypedData {
  domain: {
    name?: string;
    version?: string;
    chainId?: number;
    verifyingContract?: string;
    salt?: string;
  };
  types: Record<string, Array<{ name: string; type: string }>>;
  primaryType: string;
  message: Record<string, unknown>;
}

export interface BankrTransaction {
  to: string;
  chainId: number;
  value?: string;
  data?: string;
  gas?: string;
  gasPrice?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  nonce?: number;
}

export interface BankrSignResponse {
  success: boolean;
  signature?: string;
  signer?: string;
  signatureType?: string;
  error?: string;
  message?: string;
}

export interface BankrUserInfo {
  success: boolean;
  user?: {
    id: string;
    email?: string;
    wallets?: Array<{
      address: string;
      chain: string;
    }>;
  };
  error?: string;
}

// Chain ID mapping for Bankr-supported chains
const BANKR_CHAIN_IDS: Record<string, number> = {
  'ethereum': 1,
  'base': 8453,
  'arbitrum': 42161,
  // Bankr also supports polygon (137) and unichain
};

// ═══════════════════════════════════════════════════════════════════
//                       BANKR ADAPTER CLASS
// ═══════════════════════════════════════════════════════════════════

export class BankrAdapter extends WalletAdapter {
  private apiKey?: string;
  private baseUrl: string;
  
  constructor(config?: Partial<BankrConfig>) {
    super({
      provider: 'bankr',
      ...config,
    });
    this.apiKey = config?.apiKey;
    this.baseUrl = config?.apiUrl || 'https://api.bankr.bot';
  }
  
  get provider(): WalletProvider {
    return 'bankr' as WalletProvider;
  }
  
  get supportedChains(): ChainId[] {
    return ['ethereum', 'base', 'arbitrum'];
  }
  
  /**
   * Set API key (can be set per-agent or globally)
   */
  setApiKey(apiKey: string): void {
    this.apiKey = apiKey;
  }
  
  /**
   * Get API key for an agent (from agent metadata or global)
   */
  private getApiKey(agent: Agent): string {
    const agentKey = agent.metadata?.bankrApiKey as string | undefined;
    const key = agentKey || this.apiKey;
    if (!key) {
      throw new Error('Bankr API key not configured. Set via agent.metadata.bankrApiKey or adapter config.');
    }
    return key;
  }
  
  /**
   * Make authenticated request to Bankr API
   */
  private async request<T>(
    endpoint: string,
    options: {
      method?: string;
      body?: unknown;
      apiKey: string;
    }
  ): Promise<T> {
    const { method = 'GET', body, apiKey } = options;
    
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    
    const data = await response.json() as T;
    
    if (!response.ok) {
      const error = data as { error?: string; message?: string };
      throw new Error(error.message || error.error || `Bankr API error: ${response.status}`);
    }
    
    return data;
  }
  
  /**
   * Validate agent is configured for Bankr
   */
  async validateAgent(agent: Agent): Promise<boolean> {
    try {
      const apiKey = this.getApiKey(agent);
      const info = await this.request<BankrUserInfo>('/agent/user', {
        apiKey,
      });
      return info.success && !!info.user;
    } catch {
      return false;
    }
  }
  
  /**
   * Sign a raw digest - for EVM this is typically EIP-712 typed data
   */
  async signDigest(
    agent: Agent,
    digest: string,
    options?: SignDigestOptions
  ): Promise<SignatureResult> {
    const apiKey = this.getApiKey(agent);
    
    // For raw digest, use personal_sign
    // The digest should be the hex message to sign
    const response = await this.request<BankrSignResponse>('/agent/sign', {
      method: 'POST',
      apiKey,
      body: {
        signatureType: 'personal_sign',
        message: digest,
      },
    });
    
    if (!response.success || !response.signature) {
      throw new Error(response.error || 'Signing failed');
    }
    
    return {
      signature: response.signature,
      publicKey: response.signer || '',
      format: 'ecdsa',
    };
  }
  
  /**
   * Sign EIP-712 typed data (for Safe transactions)
   */
  async signTypedData(
    agent: Agent,
    typedData: EIP712TypedData
  ): Promise<SignatureResult> {
    const apiKey = this.getApiKey(agent);
    
    const response = await this.request<BankrSignResponse>('/agent/sign', {
      method: 'POST',
      apiKey,
      body: {
        signatureType: 'eth_signTypedData_v4',
        typedData,
      },
    });
    
    if (!response.success || !response.signature) {
      throw new Error(response.error || 'Signing failed');
    }
    
    return {
      signature: response.signature,
      publicKey: response.signer || '',
      format: 'ecdsa',
    };
  }
  
  /**
   * Sign a Safe transaction
   * Convenience method that builds the EIP-712 typed data
   */
  async signSafeTransaction(
    agent: Agent,
    safeAddress: string,
    chainId: number,
    safeTx: {
      to: string;
      value: string;
      data: string;
      operation?: number;
      safeTxGas?: string;
      baseGas?: string;
      gasPrice?: string;
      gasToken?: string;
      refundReceiver?: string;
      nonce: number;
    }
  ): Promise<SignatureResult> {
    const typedData: EIP712TypedData = {
      domain: {
        name: 'Safe',
        version: '1.3.0',
        chainId,
        verifyingContract: safeAddress,
      },
      types: {
        EIP712Domain: [
          { name: 'name', type: 'string' },
          { name: 'version', type: 'string' },
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
        to: safeTx.to,
        value: safeTx.value || '0',
        data: safeTx.data || '0x',
        operation: safeTx.operation ?? 0,
        safeTxGas: safeTx.safeTxGas || '0',
        baseGas: safeTx.baseGas || '0',
        gasPrice: safeTx.gasPrice || '0',
        gasToken: safeTx.gasToken || '0x0000000000000000000000000000000000000000',
        refundReceiver: safeTx.refundReceiver || '0x0000000000000000000000000000000000000000',
        nonce: safeTx.nonce,
      },
    };
    
    return this.signTypedData(agent, typedData);
  }
  
  /**
   * Sign and submit a transaction (not just sign)
   */
  async signTransaction(
    agent: Agent,
    transaction: BankrTransaction
  ): Promise<SignatureResult> {
    const apiKey = this.getApiKey(agent);
    
    const response = await this.request<BankrSignResponse>('/agent/sign', {
      method: 'POST',
      apiKey,
      body: {
        signatureType: 'eth_signTransaction',
        transaction,
      },
    });
    
    if (!response.success || !response.signature) {
      throw new Error(response.error || 'Signing failed');
    }
    
    return {
      signature: response.signature,
      publicKey: response.signer || '',
      format: 'ecdsa',
    };
  }
  
  /**
   * Get wallet address for an agent
   */
  async getWalletAddress(agent: Agent, chain?: string): Promise<string> {
    const apiKey = this.getApiKey(agent);
    
    const info = await this.request<BankrUserInfo>('/agent/user', {
      apiKey,
    });
    
    if (!info.success || !info.user?.wallets?.length) {
      throw new Error('No wallets found for agent');
    }
    
    // Find wallet for specific chain or return first EVM wallet
    const targetChain = chain || 'base';
    const wallet = info.user.wallets.find(w => 
      w.chain.toLowerCase() === targetChain.toLowerCase()
    ) || info.user.wallets[0];
    
    return wallet.address;
  }
  
  /**
   * Get balance - Bankr doesn't expose this directly via API
   * Would need to query chain directly
   */
  async getBalance(address: string, chainId: ChainId): Promise<BalanceInfo> {
    // TODO: Query chain RPC directly
    throw new Error('Not implemented - query chain RPC directly');
  }
  
  /**
   * Get UTXOs - Not applicable for EVM
   */
  async getUtxos(address: string, chainId: ChainId): Promise<UTXO[]> {
    throw new Error('UTXOs not applicable for EVM chains');
  }
  
  /**
   * Verify signature - Can be done client-side with viem
   */
  async verifySignature(
    digest: string,
    signature: string,
    publicKey: string
  ): Promise<boolean> {
    // TODO: Use viem's verifyMessage or verifyTypedData
    throw new Error('Not implemented - use viem directly');
  }
}

// ═══════════════════════════════════════════════════════════════════
//                        HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════

/**
 * Create a Bankr adapter with API key
 */
export function createBankrAdapter(apiKey?: string): BankrAdapter {
  return new BankrAdapter({ apiKey });
}

/**
 * Check if a chain is supported by Bankr
 */
export function isBankrSupported(chainId: ChainId): boolean {
  return chainId === 'ethereum' || chainId === 'base' || chainId === 'arbitrum';
}

/**
 * Get numeric chain ID for Bankr
 */
export function getBankrChainId(chainId: ChainId): number {
  const numericId = BANKR_CHAIN_IDS[chainId];
  if (!numericId) {
    throw new Error(`Chain ${chainId} not supported by Bankr`);
  }
  return numericId;
}
