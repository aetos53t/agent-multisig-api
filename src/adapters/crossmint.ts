/**
 * Crossmint Wallet Adapter
 * 
 * Integrates with Crossmint's smart wallet infrastructure.
 * 
 * Documentation: https://docs.crossmint.com
 */

import { 
  WalletAdapter, 
  type WalletAdapterConfig,
  type SignatureResult,
  type BalanceInfo,
  type UTXO,
  type SignDigestOptions,
  adapterRegistry,
} from './base';
import type { Agent, ChainId, WalletProvider } from '../types';

export interface CrossmintConfig extends WalletAdapterConfig {
  apiKey?: string;
}

export class CrossmintAdapter extends WalletAdapter {
  constructor(config: CrossmintConfig = { provider: 'crossmint' }) {
    super(config);
  }
  
  get provider(): WalletProvider {
    return 'crossmint';
  }
  
  get supportedChains(): ChainId[] {
    return [
      'ethereum',
      'base',
      'arbitrum',
    ];
  }
  
  async validateAgent(agent: Agent): Promise<boolean> {
    if (agent.provider !== 'crossmint') return false;
    if (!agent.publicKey) return false;
    return true;
  }
  
  async signDigest(
    agent: Agent,
    digest: string,
    options?: SignDigestOptions
  ): Promise<SignatureResult> {
    /**
     * TODO: Implement Crossmint signing
     * 
     * Crossmint API for signing:
     * POST /api/v1-alpha1/wallets/{walletId}/signatures
     * {
     *   "chain": "ethereum",
     *   "message": digest
     * }
     */
    
    throw new Error(
      'CrossmintAdapter.signDigest not yet implemented. ' +
      'Need Crossmint API key and wallet ID integration.'
    );
  }
  
  async getBalance(address: string, chainId: ChainId): Promise<BalanceInfo> {
    throw new Error('CrossmintAdapter.getBalance not yet implemented');
  }
  
  async getUtxos(address: string, chainId: ChainId): Promise<UTXO[]> {
    // Crossmint doesn't support UTXO chains natively
    throw new Error('Crossmint does not support UTXO chains');
  }
  
  async verifySignature(
    digest: string,
    signature: string,
    publicKey: string
  ): Promise<boolean> {
    const { schnorr } = await import('@noble/secp256k1');
    const { hex } = await import('@scure/base');
    
    try {
      return schnorr.verify(
        hex.decode(signature),
        hex.decode(digest),
        hex.decode(publicKey)
      );
    } catch {
      return false;
    }
  }
}

export default CrossmintAdapter;
