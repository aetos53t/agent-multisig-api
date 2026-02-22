/**
 * Confirmation Tracking Service
 * 
 * Polls mempool.space for broadcast transactions and updates status to 'confirmed'
 * when they get included in a block.
 */

import { getTransactionStatus } from './bitcoin';
import repo from '../db/repository';
import webhooks from './webhooks';
import sql from '../db';

// ═══════════════════════════════════════════════════════════════════
//                        CONFIGURATION
// ═══════════════════════════════════════════════════════════════════

const POLL_INTERVAL_MS = 60 * 1000; // Check every 60 seconds
const MAX_TRACKING_AGE_MS = 24 * 60 * 60 * 1000; // Stop tracking after 24 hours

let isRunning = false;
let pollTimeout: ReturnType<typeof setTimeout> | null = null;

// ═══════════════════════════════════════════════════════════════════
//                        TRACKING LOGIC
// ═══════════════════════════════════════════════════════════════════

/**
 * Get all proposals that need confirmation tracking
 */
async function getBroadcastProposals(): Promise<Array<{
  id: string;
  txid: string;
  chainId: string;
  multisigId: string;
  createdAt: Date;
}>> {
  if (!sql) return [];
  
  try {
    const rows = await sql`
      SELECT 
        p.id, 
        p.txid, 
        m.chain_id as "chainId",
        p.multisig_id as "multisigId",
        p.created_at as "createdAt"
      FROM proposals p
      JOIN multisigs m ON p.multisig_id = m.id
      WHERE p.status = 'broadcast' 
        AND p.txid IS NOT NULL
      ORDER BY p.created_at DESC
      LIMIT 100
    `;
    return rows as any;
  } catch (e) {
    console.error('[Confirmation] Failed to fetch broadcast proposals:', e);
    return [];
  }
}

/**
 * Check and update confirmation status for a single proposal
 */
async function checkConfirmation(proposal: {
  id: string;
  txid: string;
  chainId: string;
  multisigId: string;
}): Promise<boolean> {
  try {
    const status = await getTransactionStatus(proposal.txid, proposal.chainId as any);
    
    if (status.confirmed) {
      console.log(`[Confirmation] ✓ ${proposal.txid} confirmed in block ${status.block_height}`);
      
      // Update proposal status
      await repo.updateProposalStatus(proposal.id, 'confirmed');
      
      // Get full proposal and multisig for webhook
      const fullProposal = await repo.getProposal(proposal.id);
      const multisig = await repo.getMultisig(proposal.multisigId);
      
      if (fullProposal && multisig) {
        // Notify agents
        const agents = await repo.getAgentsForMultisig(multisig.id);
        for (const agent of agents) {
          if (agent.webhookUrl) {
            try {
              await fetch(agent.webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  event: 'proposal.confirmed',
                  timestamp: new Date().toISOString(),
                  data: {
                    proposalId: proposal.id,
                    multisigId: multisig.id,
                    txid: proposal.txid,
                    blockHeight: status.block_height,
                    blockHash: status.block_hash,
                    message: `Transaction confirmed in block ${status.block_height}`,
                  },
                }),
              });
            } catch (e) {
              console.error(`[Confirmation] Webhook failed for ${agent.id}:`, e);
            }
          }
        }
      }
      
      return true;
    }
    
    return false;
  } catch (e) {
    console.error(`[Confirmation] Error checking ${proposal.txid}:`, e);
    return false;
  }
}

/**
 * Run a single poll cycle
 */
async function pollOnce(): Promise<{ checked: number; confirmed: number }> {
  const proposals = await getBroadcastProposals();
  
  if (proposals.length === 0) {
    return { checked: 0, confirmed: 0 };
  }
  
  console.log(`[Confirmation] Checking ${proposals.length} broadcast transactions...`);
  
  let confirmed = 0;
  for (const proposal of proposals) {
    // Skip if too old (avoid checking forever)
    const age = Date.now() - new Date(proposal.createdAt).getTime();
    if (age > MAX_TRACKING_AGE_MS) {
      console.log(`[Confirmation] Skipping ${proposal.txid} - too old (${Math.round(age / 3600000)}h)`);
      continue;
    }
    
    if (await checkConfirmation(proposal)) {
      confirmed++;
    }
    
    // Small delay between API calls to be nice to mempool.space
    await new Promise(r => setTimeout(r, 500));
  }
  
  return { checked: proposals.length, confirmed };
}

// ═══════════════════════════════════════════════════════════════════
//                        SERVICE CONTROL
// ═══════════════════════════════════════════════════════════════════

/**
 * Start the confirmation tracking service
 */
export function start(): void {
  if (isRunning) {
    console.log('[Confirmation] Already running');
    return;
  }
  
  if (!sql) {
    console.log('[Confirmation] No database, skipping confirmation tracking');
    return;
  }
  
  isRunning = true;
  console.log('[Confirmation] Starting confirmation tracking service');
  
  const poll = async () => {
    if (!isRunning) return;
    
    try {
      const result = await pollOnce();
      if (result.confirmed > 0) {
        console.log(`[Confirmation] Confirmed ${result.confirmed}/${result.checked} transactions`);
      }
    } catch (e) {
      console.error('[Confirmation] Poll error:', e);
    }
    
    if (isRunning) {
      pollTimeout = setTimeout(poll, POLL_INTERVAL_MS);
    }
  };
  
  // Start polling after a short delay
  pollTimeout = setTimeout(poll, 5000);
}

/**
 * Stop the confirmation tracking service
 */
export function stop(): void {
  isRunning = false;
  if (pollTimeout) {
    clearTimeout(pollTimeout);
    pollTimeout = null;
  }
  console.log('[Confirmation] Stopped confirmation tracking service');
}

/**
 * Check if service is running
 */
export function status(): { running: boolean } {
  return { running: isRunning };
}

export default {
  start,
  stop,
  status,
  pollOnce,
};
