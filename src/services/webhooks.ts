/**
 * Webhook Delivery Service
 * 
 * Notifies agents when:
 * - A new proposal is created for their multisig
 * - Their signature is needed
 * - Threshold is reached (ready for finalization)
 * - Transaction is broadcast
 */

import { createHmac } from 'crypto';
import type { Agent, Proposal, Multisig } from '../types';
import repo from '../db/repository';
import webhookQueue from './webhookQueue';

export type WebhookEvent = 
  | 'proposal.created'
  | 'proposal.signature_needed'
  | 'proposal.threshold_reached'
  | 'proposal.finalized'
  | 'proposal.broadcast'
  | 'proposal.failed';

export interface WebhookPayload {
  event: WebhookEvent;
  timestamp: string;
  data: {
    proposalId?: string;
    multisigId?: string;
    agentId?: string;
    status?: string;
    signatureCount?: number;
    threshold?: number;
    txid?: string;
    message?: string;
  };
}

interface DeliveryResult {
  agentId: string;
  webhookUrl: string;
  success: boolean;
  statusCode?: number;
  error?: string;
  duration: number;
}

// Retry configuration
const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 5000, 30000]; // 1s, 5s, 30s

/**
 * Sign webhook payload with HMAC-SHA256
 */
function signPayload(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

/**
 * Deliver webhook to a single agent
 */
async function deliverToAgent(
  agent: Agent,
  payload: WebhookPayload,
  attempt: number = 0
): Promise<DeliveryResult> {
  if (!agent.webhookUrl) {
    return {
      agentId: agent.id,
      webhookUrl: '',
      success: false,
      error: 'No webhook URL configured',
      duration: 0,
    };
  }

  const startTime = Date.now();
  const body = JSON.stringify(payload);
  
  // Get webhook secret from agent metadata or use agent ID
  const secret = (agent.metadata?.webhookSecret as string) || agent.id;
  const signature = signPayload(body, secret);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout

    const response = await fetch(agent.webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': signature,
        'X-Webhook-Event': payload.event,
        'X-Webhook-Timestamp': payload.timestamp,
      },
      body,
      signal: controller.signal,
    });

    clearTimeout(timeout);
    const duration = Date.now() - startTime;

    if (response.ok) {
      console.log(`[Webhook] ✓ ${agent.id}: ${payload.event} (${duration}ms)`);
      return {
        agentId: agent.id,
        webhookUrl: agent.webhookUrl,
        success: true,
        statusCode: response.status,
        duration,
      };
    }

    // Non-2xx response
    const error = `HTTP ${response.status}`;
    console.log(`[Webhook] ✗ ${agent.id}: ${error}`);

    // Retry on 5xx errors (immediate retries)
    if (response.status >= 500 && attempt < MAX_RETRIES) {
      await sleep(RETRY_DELAYS[attempt] || 30000);
      return deliverToAgent(agent, payload, attempt + 1);
    }

    // Queue for persistent retry if all immediate retries failed
    if (attempt >= MAX_RETRIES - 1) {
      webhookQueue.enqueue({
        agentId: agent.id,
        webhookUrl: agent.webhookUrl,
        webhookSecret: (agent.metadata?.webhookSecret as string) || undefined,
        event: payload.event,
        payload: payload as any,
        error,
      }).catch(e => console.error('[Webhook] Queue error:', e));
    }

    return {
      agentId: agent.id,
      webhookUrl: agent.webhookUrl,
      success: false,
      statusCode: response.status,
      error,
      duration,
    };

  } catch (err: any) {
    const duration = Date.now() - startTime;
    const error = err.name === 'AbortError' ? 'Timeout' : err.message;
    
    console.log(`[Webhook] ✗ ${agent.id}: ${error}`);

    // Retry on network errors (immediate retries)
    if (attempt < MAX_RETRIES) {
      await sleep(RETRY_DELAYS[attempt] || 30000);
      return deliverToAgent(agent, payload, attempt + 1);
    }

    // Queue for persistent retry if all immediate retries failed
    webhookQueue.enqueue({
      agentId: agent.id,
      webhookUrl: agent.webhookUrl,
      webhookSecret: (agent.metadata?.webhookSecret as string) || undefined,
      event: payload.event,
      payload: payload as any,
      error,
    }).catch(e => console.error('[Webhook] Queue error:', e));

    return {
      agentId: agent.id,
      webhookUrl: agent.webhookUrl,
      success: false,
      error,
      duration,
    };
  }
}

/**
 * Deliver webhook to multiple agents
 */
async function deliverToAgents(
  agents: Agent[],
  payload: WebhookPayload
): Promise<DeliveryResult[]> {
  const agentsWithWebhooks = agents.filter(a => a.webhookUrl);
  
  if (agentsWithWebhooks.length === 0) {
    return [];
  }

  console.log(`[Webhook] Delivering ${payload.event} to ${agentsWithWebhooks.length} agent(s)`);
  
  const results = await Promise.all(
    agentsWithWebhooks.map(agent => deliverToAgent(agent, payload))
  );

  const successful = results.filter(r => r.success).length;
  console.log(`[Webhook] Delivered: ${successful}/${agentsWithWebhooks.length}`);

  return results;
}

// ═══════════════════════════════════════════════════════════════════
//                         EVENT HANDLERS
// ═══════════════════════════════════════════════════════════════════

/**
 * Notify agents when a proposal is created
 */
export async function notifyProposalCreated(
  proposal: Proposal,
  multisig: Multisig
): Promise<DeliveryResult[]> {
  const agents = await repo.getAgentsForMultisig(multisig.id);
  
  const payload: WebhookPayload = {
    event: 'proposal.created',
    timestamp: new Date().toISOString(),
    data: {
      proposalId: proposal.id,
      multisigId: multisig.id,
      status: proposal.status,
      threshold: multisig.threshold,
      message: `New proposal created: ${proposal.note || 'No description'}`,
    },
  };

  return deliverToAgents(agents, payload);
}

/**
 * Notify a specific agent that their signature is needed
 */
export async function notifySignatureNeeded(
  agent: Agent,
  proposal: Proposal,
  multisig: Multisig
): Promise<DeliveryResult> {
  const payload: WebhookPayload = {
    event: 'proposal.signature_needed',
    timestamp: new Date().toISOString(),
    data: {
      proposalId: proposal.id,
      multisigId: multisig.id,
      agentId: agent.id,
      signatureCount: proposal.signatures?.length || 0,
      threshold: multisig.threshold,
      message: `Your signature is needed for proposal ${proposal.id}`,
    },
  };

  return deliverToAgent(agent, payload);
}

/**
 * Notify all agents when threshold is reached
 */
export async function notifyThresholdReached(
  proposal: Proposal,
  multisig: Multisig
): Promise<DeliveryResult[]> {
  const agents = await repo.getAgentsForMultisig(multisig.id);
  
  const payload: WebhookPayload = {
    event: 'proposal.threshold_reached',
    timestamp: new Date().toISOString(),
    data: {
      proposalId: proposal.id,
      multisigId: multisig.id,
      signatureCount: proposal.signatures?.length || 0,
      threshold: multisig.threshold,
      message: `Threshold reached! Proposal ${proposal.id} ready for finalization`,
    },
  };

  return deliverToAgents(agents, payload);
}

/**
 * Notify all agents when transaction is broadcast
 */
export async function notifyBroadcast(
  proposal: Proposal,
  multisig: Multisig,
  txid: string
): Promise<DeliveryResult[]> {
  const agents = await repo.getAgentsForMultisig(multisig.id);
  
  const payload: WebhookPayload = {
    event: 'proposal.broadcast',
    timestamp: new Date().toISOString(),
    data: {
      proposalId: proposal.id,
      multisigId: multisig.id,
      txid,
      message: `Transaction broadcast: ${txid}`,
    },
  };

  return deliverToAgents(agents, payload);
}

/**
 * Notify all agents when a proposal fails
 */
export async function notifyFailure(
  proposal: Proposal,
  multisig: Multisig,
  reason: string
): Promise<DeliveryResult[]> {
  const agents = await repo.getAgentsForMultisig(multisig.id);
  
  const payload: WebhookPayload = {
    event: 'proposal.failed',
    timestamp: new Date().toISOString(),
    data: {
      proposalId: proposal.id,
      multisigId: multisig.id,
      status: 'failed',
      message: `Proposal failed: ${reason}`,
    },
  };

  return deliverToAgents(agents, payload);
}

// ═══════════════════════════════════════════════════════════════════
//                           UTILITIES
// ═══════════════════════════════════════════════════════════════════

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export default {
  notifyProposalCreated,
  notifySignatureNeeded,
  notifyThresholdReached,
  notifyBroadcast,
  notifyFailure,
};
