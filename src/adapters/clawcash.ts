/**
 * Claw Cash Wallet Adapter
 * 
 * Integrates with Claw Cash - Bitcoin for Agents
 * https://clw.cash
 * 
 * Architecture:
 * - Private keys stored in AWS Nitro Enclaves (hardware-isolated)
 * - CLI communicates with enclave over attested TLS channel
 * - Enclave signs, returns signature - key never exposed
 * 
 * Supported:
 * - Bitcoin on-chain
 * - Lightning
 * - Arkade VTXOs (instant off-chain)
 * 
 * Auth: Challenge-callback (Telegram, Slack, Google, etc.)
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

export interface ClawCashConfig extends WalletAdapterConfig {
  /**
   * Claw Cash API endpoint
   * Default: https://api.clw.cash
   */
  apiUrl?: string;
  
  /**
   * Session JWT from auth flow
   */
  sessionToken?: string;
  
  /**
   * Agent identifier for enclave
   */
  agentId?: string;
}

export class ClawCashAdapter extends WalletAdapter {
  private apiUrl: string;
  private sessionToken?: string;
  private agentId?: string;
  
  constructor(config: ClawCashConfig = { provider: 'clawcash' }) {
    super(config);
    this.apiUrl = config.apiUrl || process.env.CLAWCASH_API_URL || 'https://api.clw.cash';
    this.sessionToken = config.sessionToken || process.env.CLAWCASH_SESSION_TOKEN;
    this.agentId = config.agentId || process.env.CLAWCASH_AGENT_ID;
  }
  
  get provider(): WalletProvider {
    return 'clawcash';
  }
  
  get supportedChains(): ChainId[] {
    return [
      'bitcoin-mainnet',
      'bitcoin-testnet',
      // Arkade is technically its own layer but settles to Bitcoin
    ];
  }
  
  private async request<T>(
    method: string,
    endpoint: string,
    body?: unknown
  ): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    
    if (this.sessionToken) {
      headers['Authorization'] = `Bearer ${this.sessionToken}`;
    }
    
    const response = await fetch(`${this.apiUrl}${endpoint}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Claw Cash API error: ${response.status} ${error}`);
    }
    
    return response.json();
  }
  
  async validateAgent(agent: Agent): Promise<boolean> {
    if (agent.provider !== 'clawcash') return false;
    if (!agent.publicKey || agent.publicKey.length < 64) return false;
    
    // Optionally verify agent exists in Claw Cash
    // try {
    //   await this.request('GET', `/v1/agents/${agent.id}`);
    //   return true;
    // } catch {
    //   return false;
    // }
    
    return true;
  }
  
  /**
   * Sign a raw 32-byte digest using the enclave-protected key
   * 
   * Claw Cash enclave architecture:
   * 1. CLI sends unsigned data to enclave over attested TLS
   * 2. Enclave signs with secp256k1 key (never exposed)
   * 3. Returns signature
   * 
   * For Taproot multisig, we need Schnorr signatures over BIP341 sighashes.
   */
  async signDigest(
    agent: Agent,
    digest: string,
    options?: SignDigestOptions
  ): Promise<SignatureResult> {
    if (!digest || digest.length !== 64) {
      throw new Error('Digest must be 32 bytes (64 hex chars)');
    }
    
    if (agent.provider !== 'clawcash') {
      throw new Error(`Agent ${agent.id} is not a Claw Cash agent`);
    }
    
    /**
     * Claw Cash Enclave Signing API (proposed/expected)
     * 
     * POST /v1/sign
     * {
     *   agentId: string,
     *   digest: string,      // 32-byte hex
     *   scheme: 'schnorr' | 'ecdsa',
     *   context?: {
     *     purpose: 'taproot-multisig',
     *     proposalId?: string,
     *     inputIndex?: number,
     *   }
     * }
     * 
     * Response:
     * {
     *   signature: string,   // 64-byte hex (Schnorr) or 65-byte (ECDSA)
     *   publicKey: string,   // 32-byte x-only (Schnorr) or 33-byte compressed
     * }
     */
    
    try {
      const result = await this.request<{
        signature: string;
        publicKey: string;
      }>('POST', '/v1/sign', {
        agentId: agent.id,
        digest,
        scheme: options?.scheme || 'schnorr',
        context: {
          purpose: 'taproot-multisig',
          inputIndex: options?.inputIndex,
        },
      });
      
      return {
        signature: result.signature,
        publicKey: result.publicKey,
        format: options?.scheme || 'schnorr',
      };
    } catch (error) {
      // If /v1/sign doesn't exist yet, try CLI approach
      console.warn('Claw Cash /v1/sign not available:', error);
      
      // Fallback: use CLI via exec (if running locally)
      throw new Error(
        'ClawCashAdapter.signDigest: API endpoint not available. ' +
        'Ensure Claw Cash API supports /v1/sign for raw digest signing, ' +
        'or use the CLI: `cash sign-digest --hex <digest>`'
      );
    }
  }
  
  async getBalance(address: string, chainId: ChainId): Promise<BalanceInfo> {
    if (!this.supportsChain(chainId)) {
      throw new Error(`Chain ${chainId} not supported by Claw Cash`);
    }
    
    /**
     * Claw Cash balance includes:
     * - Bitcoin on-chain
     * - Lightning (inbound capacity)
     * - Arkade VTXOs (instant layer)
     * 
     * CLI: cash balance
     */
    
    try {
      const result = await this.request<{
        btc: { sats: number; confirmed: number; unconfirmed: number };
        lightning: { sats: number };
        arkade: { sats: number };
      }>('GET', `/v1/balance?address=${address}`);
      
      const total = BigInt(result.btc.sats + result.lightning.sats + result.arkade.sats);
      const confirmed = BigInt(result.btc.confirmed);
      
      return {
        confirmed,
        unconfirmed: total - confirmed,
        total,
      };
    } catch (error) {
      // Fallback to mempool.space for on-chain balance
      const { getBalance } = await import('../services/bitcoin');
      return getBalance(address, chainId);
    }
  }
  
  async getUtxos(address: string, chainId: ChainId): Promise<UTXO[]> {
    if (!this.supportsChain(chainId)) {
      throw new Error(`Chain ${chainId} not supported by Claw Cash`);
    }
    
    // For UTXOs, use mempool.space (Claw Cash focuses on Lightning/Arkade)
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
  
  // ═══════════════════════════════════════════════════════════════════
  //                    CLAW CASH SPECIFIC METHODS
  // ═══════════════════════════════════════════════════════════════════
  
  /**
   * Send via Arkade (instant, minimal fees)
   */
  async sendArkade(
    toAddress: string, 
    amountSats: number
  ): Promise<{ vtxoId: string }> {
    return this.request('POST', '/v1/send/arkade', {
      to: toAddress,
      amount: amountSats,
    });
  }
  
  /**
   * Send via Lightning
   */
  async sendLightning(
    invoice: string
  ): Promise<{ paymentHash: string; preimage: string }> {
    return this.request('POST', '/v1/send/lightning', {
      invoice,
    });
  }
  
  /**
   * Create payment link for humans to pay in stablecoins
   */
  async createPaymentLink(
    amountUsd: number,
    description?: string
  ): Promise<{ url: string; expiresAt: string }> {
    return this.request('POST', '/v1/payment-links', {
      amount: amountUsd,
      currency: 'USD',
      description,
    });
  }
}

// Auto-register
adapterRegistry.register(new ClawCashAdapter());

export default ClawCashAdapter;
