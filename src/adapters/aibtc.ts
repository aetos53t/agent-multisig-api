/**
 * AIBTC Wallet Adapter
 * 
 * Integrates with the aibtc MCP server for wallet operations.
 * 
 * Documentation: https://github.com/aibtcdev/ai-agent-crew
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

export interface AIBTCConfig extends WalletAdapterConfig {
  mcpServerUrl?: string;
}

export class AIBTCAdapter extends WalletAdapter {
  private mcpServerUrl: string;
  
  constructor(config: AIBTCConfig = { provider: 'aibtc' }) {
    super(config);
    this.mcpServerUrl = config.mcpServerUrl || process.env.AIBTC_MCP_URL || 'http://localhost:3001';
  }
  
  get provider(): WalletProvider {
    return 'aibtc';
  }
  
  get supportedChains(): ChainId[] {
    return [
      'bitcoin-mainnet',
      'bitcoin-testnet',
      'bitcoin-signet',
      'stacks-mainnet',
      'stacks-testnet',
    ];
  }
  
  async validateAgent(agent: Agent): Promise<boolean> {
    if (agent.provider !== 'aibtc') return false;
    if (!agent.publicKey || agent.publicKey.length < 64) return false;
    return true;
  }
  
  async signDigest(
    agent: Agent,
    digest: string,
    options?: SignDigestOptions
  ): Promise<SignatureResult> {
    // Validate inputs
    if (!digest || digest.length !== 64) {
      throw new Error('Digest must be 32 bytes (64 hex chars)');
    }
    
    if (agent.provider !== 'aibtc') {
      throw new Error(`Agent ${agent.id} is not an aibtc agent`);
    }
    
    /**
     * AIBTC MCP Server Integration
     * 
     * The aibtc MCP server should expose signing tools. Options:
     * 
     * 1. Direct HTTP API (if exposed):
     *    POST /api/sign
     *    { walletId: agent.id, message: digest, scheme: 'schnorr' }
     * 
     * 2. MCP Tool Call (via MCP client):
     *    { tool: 'sign_message', params: { message: digest } }
     * 
     * 3. PSBT Signing:
     *    POST /api/sign-psbt
     *    { psbt: options.psbt, inputIndex: options.inputIndex }
     * 
     * For now, we'll use the HTTP API approach when available.
     */
    
    // Try to call the MCP server
    try {
      const response = await fetch(`${this.mcpServerUrl}/api/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletId: agent.id,
          message: digest,
          scheme: options?.scheme || 'schnorr',
        }),
      });
      
      if (response.ok) {
        const result = await response.json();
        return {
          signature: result.signature,
          publicKey: agent.xOnlyPubkey || agent.publicKey,
          format: 'schnorr',
        };
      }
    } catch (error) {
      // MCP server not available or doesn't support this endpoint
      console.warn('AIBTC MCP sign endpoint not available:', error);
    }
    
    // Fallback: throw with instructions
    throw new Error(
      'AIBTCAdapter.signDigest: MCP server sign endpoint not available. ' +
      'Ensure aibtc MCP server is running and exposes /api/sign endpoint, ' +
      'or implement MCP tool calling directly.'
    );
  }
  
  async getBalance(address: string, chainId: ChainId): Promise<BalanceInfo> {
    if (!this.supportsChain(chainId)) {
      throw new Error(`Chain ${chainId} not supported by aibtc`);
    }
    
    // Use mempool.space for Bitcoin chains
    if (chainId.startsWith('bitcoin-')) {
      const { getBalance } = await import('../services/bitcoin');
      return getBalance(address, chainId);
    }
    
    // For Stacks, would use Hiro API
    throw new Error(`Balance fetch for ${chainId} not yet implemented`);
  }
  
  async getUtxos(address: string, chainId: ChainId): Promise<UTXO[]> {
    if (!this.supportsChain(chainId)) {
      throw new Error(`Chain ${chainId} not supported by aibtc`);
    }
    
    if (chainId.startsWith('bitcoin-')) {
      const { getUtxos } = await import('../services/bitcoin');
      const utxos = await getUtxos(address, chainId);
      return utxos.map(u => ({
        txid: u.txid,
        vout: u.vout,
        amount: u.amount,
        scriptPubkey: u.scriptPubkey,
        confirmations: 0,
      }));
    }
    
    throw new Error(`UTXO fetch for ${chainId} not supported`);
  }
  
  async verifySignature(
    digest: string,
    signature: string,
    publicKey: string
  ): Promise<boolean> {
    const { schnorr } = await import('@noble/secp256k1');
    const { hex } = await import('@scure/base');
    
    try {
      const digestBytes = hex.decode(digest);
      const sigBytes = hex.decode(signature);
      const pubkeyBytes = hex.decode(publicKey);
      
      return schnorr.verify(sigBytes, digestBytes, pubkeyBytes);
    } catch (error) {
      console.error('Signature verification failed:', error);
      return false;
    }
  }
}

// Auto-register
adapterRegistry.register(new AIBTCAdapter());

export default AIBTCAdapter;
