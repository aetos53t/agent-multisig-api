/**
 * Agent Multisig SDK
 * 
 * TypeScript client for the Agent Multisig Coordination API.
 * Enables AI agents to participate in multi-signature Bitcoin transactions.
 * 
 * @example
 * ```typescript
 * import { AgentMultisig } from '@agent-multisig/sdk';
 * 
 * const client = new AgentMultisig({
 *   apiUrl: 'https://agent-multisig-api-production.up.railway.app',
 *   apiKey: 'your-api-key'
 * });
 * 
 * // Register an agent
 * const agent = await client.registerAgent({
 *   name: 'TreasuryBot',
 *   provider: 'aibtc',
 *   publicKey: '9350761ae700acd872510de161bca0b90b78ddc007936674b318be8a50c531b5'
 * });
 * 
 * // Create a 2-of-3 multisig
 * const multisig = await client.createMultisig({
 *   name: 'AI Treasury',
 *   threshold: 2,
 *   agents: [agent1.id, agent2.id, agent3.id],
 *   network: 'mainnet'
 * });
 * 
 * // Create a spend proposal
 * const proposal = await client.createProposal({
 *   multisigId: multisig.id,
 *   to: 'bc1q...',
 *   amount: 10000
 * });
 * 
 * // Sign the proposal
 * await client.signProposal(proposal.id, agent.id, signature);
 * ```
 */

// Types
export interface AgentMultisigConfig {
  apiUrl: string;
  apiKey?: string;
  timeout?: number;
}

export interface Agent {
  id: string;
  name: string;
  provider: 'aibtc' | 'agentkit' | 'crossmint' | 'clawcash' | 'bankr' | 'custom';
  publicKey: string;
  chain: 'bitcoin' | 'stacks' | 'evm' | 'solana';
  createdAt: string;
}

export interface RegisterAgentInput {
  name: string;
  provider: Agent['provider'];
  publicKey: string;
  chain?: Agent['chain'];
  webhookUrl?: string;
  metadata?: Record<string, unknown>;
}

export interface Multisig {
  id: string;
  name: string;
  address: string;
  threshold: number;
  totalSigners: number;
  agents: string[];
  network: 'mainnet' | 'testnet' | 'signet';
  chain: 'bitcoin' | 'stacks' | 'evm' | 'solana';
  scriptHex?: string;
  createdAt: string;
}

export interface CreateMultisigInput {
  name: string;
  threshold: number;
  agents: string[];
  network?: 'mainnet' | 'testnet' | 'signet';
  chain?: Multisig['chain'];
}

export interface Proposal {
  id: string;
  multisigId: string;
  type: 'spend' | 'custom';
  status: 'pending' | 'ready' | 'broadcast' | 'confirmed' | 'failed';
  to?: string;
  amount?: number;
  psbtHex?: string;
  signatures: ProposalSignature[];
  txid?: string;
  createdAt: string;
  expiresAt?: string;
}

export interface ProposalSignature {
  agentId: string;
  signature: string;
  signedAt: string;
}

export interface CreateProposalInput {
  multisigId: string;
  to: string;
  amount: number;
  memo?: string;
}

export interface SignProposalInput {
  proposalId: string;
  agentId: string;
  signature: string;
}

// Error types
export class AgentMultisigError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public code?: string
  ) {
    super(message);
    this.name = 'AgentMultisigError';
  }
}

// Main client
export class AgentMultisig {
  private apiUrl: string;
  private apiKey?: string;
  private timeout: number;

  constructor(config: AgentMultisigConfig) {
    this.apiUrl = config.apiUrl.replace(/\/$/, '');
    this.apiKey = config.apiKey;
    this.timeout = config.timeout ?? 30000;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const url = `${this.apiUrl}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const data = await response.json();

      if (!response.ok) {
        throw new AgentMultisigError(
          data.error || data.message || 'Request failed',
          response.status,
          data.code
        );
      }

      return data as T;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof AgentMultisigError) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        throw new AgentMultisigError('Request timeout', 408, 'TIMEOUT');
      }
      throw new AgentMultisigError(
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  // ==================== Health ====================

  async health(): Promise<{ status: string; version: string }> {
    return this.request('GET', '/health');
  }

  // ==================== Agents ====================

  /**
   * Register a new agent with the coordination API.
   */
  async registerAgent(input: RegisterAgentInput): Promise<Agent> {
    return this.request('POST', '/agents', input);
  }

  /**
   * Get an agent by ID.
   */
  async getAgent(agentId: string): Promise<Agent> {
    return this.request('GET', `/agents/${agentId}`);
  }

  /**
   * List all registered agents.
   */
  async listAgents(): Promise<Agent[]> {
    return this.request('GET', '/agents');
  }

  // ==================== Multisigs ====================

  /**
   * Create a new multisig wallet.
   * 
   * @example
   * ```typescript
   * const multisig = await client.createMultisig({
   *   name: 'AI Treasury',
   *   threshold: 2,
   *   agents: ['agent_abc', 'agent_def', 'agent_ghi'],
   *   network: 'mainnet'
   * });
   * console.log('Fund this address:', multisig.address);
   * ```
   */
  async createMultisig(input: CreateMultisigInput): Promise<Multisig> {
    return this.request('POST', '/multisigs', input);
  }

  /**
   * Get a multisig by ID.
   */
  async getMultisig(multisigId: string): Promise<Multisig> {
    return this.request('GET', `/multisigs/${multisigId}`);
  }

  /**
   * List all multisigs.
   */
  async listMultisigs(): Promise<Multisig[]> {
    return this.request('GET', '/multisigs');
  }

  /**
   * Get the balance of a multisig wallet.
   */
  async getMultisigBalance(multisigId: string): Promise<{
    confirmed: number;
    unconfirmed: number;
    utxos: Array<{ txid: string; vout: number; value: number }>;
  }> {
    return this.request('GET', `/multisigs/${multisigId}/balance`);
  }

  // ==================== Proposals ====================

  /**
   * Create a spend proposal for a multisig.
   * 
   * @example
   * ```typescript
   * const proposal = await client.createProposal({
   *   multisigId: 'msig_xyz',
   *   to: 'bc1qpzlw29z50cz7ysjpsaqggtscya3p6ggehnsp2g',
   *   amount: 10000  // satoshis
   * });
   * console.log('PSBT to sign:', proposal.psbtHex);
   * ```
   */
  async createProposal(input: CreateProposalInput): Promise<Proposal> {
    return this.request('POST', '/proposals', input);
  }

  /**
   * Get a proposal by ID.
   */
  async getProposal(proposalId: string): Promise<Proposal> {
    return this.request('GET', `/proposals/${proposalId}`);
  }

  /**
   * List proposals, optionally filtered by multisig.
   */
  async listProposals(multisigId?: string): Promise<Proposal[]> {
    const path = multisigId 
      ? `/proposals?multisigId=${multisigId}`
      : '/proposals';
    return this.request('GET', path);
  }

  /**
   * Sign a proposal with an agent's key.
   * 
   * @example
   * ```typescript
   * // Agent signs the PSBT and submits signature
   * const signature = await myWallet.signPsbt(proposal.psbtHex);
   * await client.signProposal({
   *   proposalId: proposal.id,
   *   agentId: myAgent.id,
   *   signature: signature
   * });
   * ```
   */
  async signProposal(input: SignProposalInput): Promise<Proposal> {
    return this.request('POST', `/proposals/${input.proposalId}/sign`, {
      agentId: input.agentId,
      signature: input.signature,
    });
  }

  /**
   * Broadcast a fully-signed proposal.
   */
  async broadcastProposal(proposalId: string): Promise<{ txid: string }> {
    return this.request('POST', `/proposals/${proposalId}/broadcast`);
  }

  // ==================== Convenience Methods ====================

  /**
   * Create a multisig and register agents in one call.
   * 
   * @example
   * ```typescript
   * const { multisig, agents } = await client.quickSetup({
   *   name: 'Quick Treasury',
   *   threshold: 2,
   *   signers: [
   *     { name: 'Bot1', provider: 'aibtc', publicKey: '...' },
   *     { name: 'Bot2', provider: 'aibtc', publicKey: '...' },
   *     { name: 'Bot3', provider: 'aibtc', publicKey: '...' },
   *   ]
   * });
   * ```
   */
  async quickSetup(input: {
    name: string;
    threshold: number;
    signers: RegisterAgentInput[];
    network?: 'mainnet' | 'testnet' | 'signet';
  }): Promise<{ multisig: Multisig; agents: Agent[] }> {
    // Register all agents
    const agents = await Promise.all(
      input.signers.map(signer => this.registerAgent(signer))
    );

    // Create multisig with agent IDs
    const multisig = await this.createMultisig({
      name: input.name,
      threshold: input.threshold,
      agents: agents.map(a => a.id),
      network: input.network,
    });

    return { multisig, agents };
  }

  /**
   * Wait for a proposal to reach a target status.
   */
  async waitForProposal(
    proposalId: string,
    targetStatus: Proposal['status'],
    options?: { timeoutMs?: number; pollIntervalMs?: number }
  ): Promise<Proposal> {
    const timeout = options?.timeoutMs ?? 300000; // 5 minutes
    const interval = options?.pollIntervalMs ?? 5000; // 5 seconds
    const start = Date.now();

    while (Date.now() - start < timeout) {
      const proposal = await this.getProposal(proposalId);
      
      if (proposal.status === targetStatus) {
        return proposal;
      }
      
      if (proposal.status === 'failed') {
        throw new AgentMultisigError(
          'Proposal failed',
          400,
          'PROPOSAL_FAILED'
        );
      }

      await new Promise(resolve => setTimeout(resolve, interval));
    }

    throw new AgentMultisigError(
      `Timeout waiting for proposal to reach ${targetStatus}`,
      408,
      'TIMEOUT'
    );
  }
}

// Default export
export default AgentMultisig;
