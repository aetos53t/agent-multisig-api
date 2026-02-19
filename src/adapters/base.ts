/**
 * Base Wallet Provider Adapter
 * 
 * Each wallet provider implements this interface.
 * The coordination API calls these methods; adapters handle
 * provider-specific details.
 */

import type { Agent, ChainId, WalletProvider } from '../types';

export interface WalletAdapterConfig {
  provider: WalletProvider;
  apiUrl?: string;
  apiKey?: string;
}

export interface SignatureResult {
  signature: string;           // Hex-encoded signature
  publicKey: string;           // Public key that signed
  format: 'schnorr' | 'ecdsa'; // Signature format
}

export interface BalanceInfo {
  confirmed: bigint;
  unconfirmed: bigint;
  total: bigint;
}

export interface UTXO {
  txid: string;
  vout: number;
  amount: bigint;
  scriptPubkey: string;
  confirmations: number;
}

/**
 * Abstract base class for wallet provider adapters
 */
export abstract class WalletAdapter {
  protected config: WalletAdapterConfig;
  
  constructor(config: WalletAdapterConfig) {
    this.config = config;
  }
  
  /**
   * Get the provider name
   */
  abstract get provider(): WalletProvider;
  
  /**
   * Get supported chains for this provider
   */
  abstract get supportedChains(): ChainId[];
  
  /**
   * Check if provider supports a specific chain
   */
  supportsChain(chainId: ChainId): boolean {
    return this.supportedChains.includes(chainId);
  }
  
  /**
   * Validate that an agent is configured correctly for this provider
   */
  abstract validateAgent(agent: Agent): Promise<boolean>;
  
  /**
   * Sign a raw 32-byte digest (hash)
   * 
   * For Taproot: Returns 64-byte Schnorr signature
   * For ECDSA: Returns 65-byte recoverable signature
   */
  abstract signDigest(
    agent: Agent,
    digest: string,
    options?: SignDigestOptions
  ): Promise<SignatureResult>;
  
  /**
   * Get balance for an address
   */
  abstract getBalance(
    address: string,
    chainId: ChainId
  ): Promise<BalanceInfo>;
  
  /**
   * Get UTXOs for an address (UTXO chains only)
   */
  abstract getUtxos(
    address: string,
    chainId: ChainId
  ): Promise<UTXO[]>;
  
  /**
   * Verify a signature
   */
  abstract verifySignature(
    digest: string,
    signature: string,
    publicKey: string
  ): Promise<boolean>;
}

export interface SignDigestOptions {
  /**
   * Signature scheme to use
   */
  scheme?: 'schnorr' | 'ecdsa';
  
  /**
   * For PSBT signing: the full PSBT to sign
   */
  psbt?: string;
  
  /**
   * Input index (for PSBT)
   */
  inputIndex?: number;
  
  /**
   * Sighash type
   */
  sighashType?: number;
}

/**
 * Registry of wallet adapters
 */
export class AdapterRegistry {
  private adapters: Map<WalletProvider, WalletAdapter> = new Map();
  
  register(adapter: WalletAdapter): void {
    this.adapters.set(adapter.provider, adapter);
  }
  
  get(provider: WalletProvider): WalletAdapter | undefined {
    return this.adapters.get(provider);
  }
  
  getOrThrow(provider: WalletProvider): WalletAdapter {
    const adapter = this.adapters.get(provider);
    if (!adapter) {
      throw new Error(`No adapter registered for provider: ${provider}`);
    }
    return adapter;
  }
  
  list(): WalletProvider[] {
    return Array.from(this.adapters.keys());
  }
}

// Global registry instance
export const adapterRegistry = new AdapterRegistry();
