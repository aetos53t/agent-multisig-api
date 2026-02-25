/**
 * Quorum Service for Eliza
 * 
 * Manages connection to Quorum API and handles signing operations.
 */

import { schnorr } from '@noble/curves/secp256k1';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';

const QUORUM_API = process.env.QUORUM_API_URL || 'https://quorumclaw.com';

export interface QuorumAgent {
  id: string;
  name: string;
  publicKey: string;
}

export interface QuorumMultisig {
  id: string;
  name: string;
  address: string;
  chainId: string;
  threshold: number;
  agents: QuorumAgent[];
}

export interface QuorumProposal {
  id: string;
  multisigId: string;
  status: 'pending' | 'finalized' | 'expired';
  outputs: Array<{ address: string; amount: string }>;
  signatures: Array<{ agentId: string; signature: string }>;
  sighashes: Array<{ inputIndex: number; sighash: string }>;
  note?: string;
  createdAt: string;
}

class QuorumService {
  private agentId: string | null = null;
  private publicKey: string | null = null;
  private privateKey: Uint8Array | null = null;
  
  get capabilityDescription(): string {
    return 'Multi-agent wallet coordination via Quorum';
  }
  
  async initialize(runtime: any): Promise<void> {
    // Try to get private key from runtime settings
    const privateKeyHex = runtime.getSetting?.('QUORUM_PRIVATE_KEY') || 
                          runtime.getSetting?.('WALLET_PRIVATE_KEY') ||
                          process.env.QUORUM_PRIVATE_KEY;
    
    if (!privateKeyHex) {
      console.warn('[Quorum] No private key configured. Set QUORUM_PRIVATE_KEY or WALLET_PRIVATE_KEY.');
      return;
    }
    
    try {
      const keyHex = String(privateKeyHex).replace('0x', '');
      this.privateKey = hexToBytes(keyHex);
      this.publicKey = bytesToHex(schnorr.getPublicKey(this.privateKey));
      
      // Register with Quorum
      await this.register(runtime.character?.name || 'Eliza Agent');
      
      console.log(`[Quorum] Initialized. Agent ID: ${this.agentId}`);
    } catch (err) {
      console.error('[Quorum] Failed to initialize:', err);
    }
  }
  
  async register(name: string): Promise<QuorumAgent> {
    if (!this.publicKey) throw new Error('No public key available');
    
    const res = await fetch(`${QUORUM_API}/v1/agents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        publicKey: this.publicKey,
        provider: 'eliza',
      }),
    });
    
    const json = await res.json();
    if (!json.success) throw new Error(json.error?.message || 'Registration failed');
    
    this.agentId = json.data.id;
    return json.data;
  }
  
  async createMultisig(params: {
    name: string;
    chainId: string;
    threshold: number;
    totalSigners: number;
  }): Promise<{ multisig: QuorumMultisig; inviteCode: string }> {
    if (!this.agentId) throw new Error('Not registered with Quorum');
    
    const res = await fetch(`${QUORUM_API}/v1/invites`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: params.name,
        chainId: params.chainId,
        threshold: params.threshold,
        slots: params.totalSigners,
        creatorAgentId: this.agentId,
      }),
    });
    
    const json = await res.json();
    if (!json.success) throw new Error(json.error?.message || 'Create failed');
    
    return {
      multisig: json.data.multisig,
      inviteCode: json.data.code,
    };
  }
  
  async joinMultisig(inviteCode: string): Promise<QuorumMultisig> {
    if (!this.agentId) throw new Error('Not registered with Quorum');
    
    const res = await fetch(`${QUORUM_API}/v1/invites/${inviteCode}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId: this.agentId }),
    });
    
    const json = await res.json();
    if (!json.success) throw new Error(json.error?.message || 'Join failed');
    
    return json.data.multisig;
  }
  
  async listMultisigs(): Promise<QuorumMultisig[]> {
    if (!this.agentId) return [];
    
    const res = await fetch(`${QUORUM_API}/v1/agents/${this.agentId}/multisigs`);
    const json = await res.json();
    
    return json.success ? json.data : [];
  }
  
  async listPendingProposals(): Promise<QuorumProposal[]> {
    const multisigs = await this.listMultisigs();
    const proposals: QuorumProposal[] = [];
    
    for (const ms of multisigs) {
      const res = await fetch(`${QUORUM_API}/v1/proposals?multisigId=${ms.id}&status=pending`);
      const json = await res.json();
      if (json.success) {
        proposals.push(...json.data);
      }
    }
    
    return proposals;
  }
  
  async getProposal(proposalId: string): Promise<QuorumProposal> {
    const res = await fetch(`${QUORUM_API}/v1/proposals/${proposalId}`);
    const json = await res.json();
    if (!json.success) throw new Error(json.error?.message || 'Proposal not found');
    return json.data;
  }
  
  async signProposal(proposalId: string): Promise<{ success: boolean; status: string; txid?: string }> {
    if (!this.agentId || !this.privateKey) {
      throw new Error('Not initialized');
    }
    
    // Get proposal to get sighash
    const proposal = await this.getProposal(proposalId);
    
    if (proposal.status !== 'pending') {
      throw new Error(`Proposal is ${proposal.status}, not pending`);
    }
    
    // Check if we already signed
    if (proposal.signatures.some(s => s.agentId === this.agentId)) {
      throw new Error('Already signed this proposal');
    }
    
    // Sign each input's sighash
    for (const sh of proposal.sighashes) {
      const sighashBytes = hexToBytes(sh.sighash);
      const signature = schnorr.sign(sighashBytes, this.privateKey);
      
      const res = await fetch(`${QUORUM_API}/v1/proposals/${proposalId}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: this.agentId,
          signature: bytesToHex(signature),
          inputIndex: sh.inputIndex,
        }),
      });
      
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'Sign failed');
      
      if (json.data.thresholdMet) {
        return {
          success: true,
          status: 'finalized',
          txid: json.data.txid,
        };
      }
    }
    
    return { success: true, status: 'pending' };
  }
  
  async createProposal(params: {
    multisigId: string;
    recipient: string;
    amount: number;
    note?: string;
  }): Promise<QuorumProposal> {
    const res = await fetch(`${QUORUM_API}/v1/proposals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        multisigId: params.multisigId,
        outputs: [{ address: params.recipient, amount: params.amount.toString() }],
        note: params.note,
        createdBy: this.agentId,
      }),
    });
    
    const json = await res.json();
    if (!json.success) throw new Error(json.error?.message || 'Create proposal failed');
    return json.data;
  }
  
  getAgentId(): string | null {
    return this.agentId;
  }
  
  getPublicKey(): string | null {
    return this.publicKey;
  }
}

export const quorumService = new QuorumService();
export default quorumService;
