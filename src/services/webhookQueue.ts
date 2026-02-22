/**
 * Persistent Webhook Retry Queue
 * 
 * Stores failed webhook deliveries in the database and retries them
 * with exponential backoff.
 */

import sql from '../db';
import { createHmac } from 'crypto';

// ═══════════════════════════════════════════════════════════════════
//                        CONFIGURATION
// ═══════════════════════════════════════════════════════════════════

const RETRY_INTERVALS = [
  60 * 1000,        // 1 minute
  5 * 60 * 1000,    // 5 minutes
  30 * 60 * 1000,   // 30 minutes
  60 * 60 * 1000,   // 1 hour
  6 * 60 * 60 * 1000, // 6 hours
];
const MAX_RETRIES = RETRY_INTERVALS.length;
const POLL_INTERVAL_MS = 30 * 1000; // Check every 30 seconds
const BATCH_SIZE = 10;

let isRunning = false;
let pollTimeout: ReturnType<typeof setTimeout> | null = null;

// ═══════════════════════════════════════════════════════════════════
//                        SCHEMA
// ═══════════════════════════════════════════════════════════════════

async function ensureTable(): Promise<void> {
  if (!sql) return;
  
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS webhook_queue (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        agent_id VARCHAR(64) NOT NULL,
        webhook_url TEXT NOT NULL,
        webhook_secret VARCHAR(256),
        event VARCHAR(64) NOT NULL,
        payload JSONB NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        next_retry_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        completed_at TIMESTAMPTZ
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_webhook_queue_retry ON webhook_queue(next_retry_at) WHERE completed_at IS NULL`;
    await sql`CREATE INDEX IF NOT EXISTS idx_webhook_queue_agent ON webhook_queue(agent_id)`;
  } catch (e) {
    console.error('[WebhookQueue] Failed to create table:', e);
  }
}

// ═══════════════════════════════════════════════════════════════════
//                        QUEUE OPERATIONS
// ═══════════════════════════════════════════════════════════════════

export interface WebhookJob {
  id: string;
  agentId: string;
  webhookUrl: string;
  webhookSecret?: string;
  event: string;
  payload: Record<string, unknown>;
  attempts: number;
  lastError?: string;
  nextRetryAt: Date;
  createdAt: Date;
}

/**
 * Add a failed webhook to the retry queue
 */
export async function enqueue(job: {
  agentId: string;
  webhookUrl: string;
  webhookSecret?: string;
  event: string;
  payload: Record<string, unknown>;
  error: string;
}): Promise<void> {
  if (!sql) {
    console.log('[WebhookQueue] No database, skipping queue');
    return;
  }
  
  try {
    await sql`
      INSERT INTO webhook_queue (agent_id, webhook_url, webhook_secret, event, payload, last_error, attempts)
      VALUES (
        ${job.agentId},
        ${job.webhookUrl},
        ${job.webhookSecret || null},
        ${job.event},
        ${JSON.stringify(job.payload)},
        ${job.error},
        1
      )
    `;
    console.log(`[WebhookQueue] Queued ${job.event} for ${job.agentId}`);
  } catch (e) {
    console.error('[WebhookQueue] Failed to enqueue:', e);
  }
}

/**
 * Get jobs ready for retry
 */
async function getReadyJobs(): Promise<WebhookJob[]> {
  if (!sql) return [];
  
  try {
    const rows = await sql`
      SELECT 
        id,
        agent_id as "agentId",
        webhook_url as "webhookUrl",
        webhook_secret as "webhookSecret",
        event,
        payload,
        attempts,
        last_error as "lastError",
        next_retry_at as "nextRetryAt",
        created_at as "createdAt"
      FROM webhook_queue
      WHERE completed_at IS NULL
        AND next_retry_at <= NOW()
        AND attempts < ${MAX_RETRIES}
      ORDER BY next_retry_at ASC
      LIMIT ${BATCH_SIZE}
    `;
    return rows as any;
  } catch (e) {
    console.error('[WebhookQueue] Failed to fetch jobs:', e);
    return [];
  }
}

/**
 * Mark a job as completed
 */
async function markCompleted(jobId: string): Promise<void> {
  if (!sql) return;
  
  await sql`
    UPDATE webhook_queue 
    SET completed_at = NOW()
    WHERE id = ${jobId}
  `;
}

/**
 * Update job after failed attempt
 */
async function markFailed(jobId: string, error: string, attempts: number): Promise<void> {
  if (!sql) return;
  
  const nextRetryMs = RETRY_INTERVALS[Math.min(attempts, RETRY_INTERVALS.length - 1)];
  const nextRetryAt = new Date(Date.now() + nextRetryMs);
  
  await sql`
    UPDATE webhook_queue 
    SET 
      attempts = ${attempts},
      last_error = ${error},
      next_retry_at = ${nextRetryAt}
    WHERE id = ${jobId}
  `;
}

/**
 * Mark job as permanently failed (max retries exceeded)
 */
async function markPermanentlyFailed(jobId: string, error: string): Promise<void> {
  if (!sql) return;
  
  await sql`
    UPDATE webhook_queue 
    SET 
      completed_at = NOW(),
      last_error = ${error}
    WHERE id = ${jobId}
  `;
}

// ═══════════════════════════════════════════════════════════════════
//                        DELIVERY
// ═══════════════════════════════════════════════════════════════════

/**
 * Attempt to deliver a webhook
 */
async function deliverWebhook(job: WebhookJob): Promise<{ success: boolean; error?: string }> {
  const body = JSON.stringify(job.payload);
  const secret = job.webhookSecret || job.agentId;
  const signature = createHmac('sha256', secret).update(body).digest('hex');
  
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    
    const response = await fetch(job.webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': signature,
        'X-Webhook-Event': job.event,
        'X-Webhook-Retry': job.attempts.toString(),
      },
      body,
      signal: controller.signal,
    });
    
    clearTimeout(timeout);
    
    if (response.ok) {
      return { success: true };
    }
    
    return { success: false, error: `HTTP ${response.status}` };
  } catch (e: any) {
    return { 
      success: false, 
      error: e.name === 'AbortError' ? 'Timeout' : e.message 
    };
  }
}

/**
 * Process a single job
 */
async function processJob(job: WebhookJob): Promise<void> {
  const result = await deliverWebhook(job);
  
  if (result.success) {
    console.log(`[WebhookQueue] ✓ Delivered ${job.event} to ${job.agentId} (attempt ${job.attempts + 1})`);
    await markCompleted(job.id);
  } else {
    const newAttempts = job.attempts + 1;
    
    if (newAttempts >= MAX_RETRIES) {
      console.log(`[WebhookQueue] ✗ Permanently failed ${job.event} to ${job.agentId}: ${result.error}`);
      await markPermanentlyFailed(job.id, result.error || 'Unknown error');
    } else {
      console.log(`[WebhookQueue] ✗ Failed ${job.event} to ${job.agentId} (attempt ${newAttempts}): ${result.error}`);
      await markFailed(job.id, result.error || 'Unknown error', newAttempts);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════
//                        SERVICE CONTROL
// ═══════════════════════════════════════════════════════════════════

/**
 * Run a single processing cycle
 */
async function processOnce(): Promise<{ processed: number; succeeded: number }> {
  const jobs = await getReadyJobs();
  
  if (jobs.length === 0) {
    return { processed: 0, succeeded: 0 };
  }
  
  let succeeded = 0;
  for (const job of jobs) {
    const before = job.attempts;
    await processJob(job);
    // Check if it was marked completed
    if (!sql) continue;
    const check = await sql`SELECT completed_at FROM webhook_queue WHERE id = ${job.id}`;
    if (check[0]?.completed_at && job.attempts === before) {
      succeeded++;
    }
  }
  
  return { processed: jobs.length, succeeded };
}

/**
 * Start the webhook retry service
 */
export async function start(): Promise<void> {
  if (isRunning) {
    console.log('[WebhookQueue] Already running');
    return;
  }
  
  if (!sql) {
    console.log('[WebhookQueue] No database, skipping webhook queue');
    return;
  }
  
  await ensureTable();
  
  isRunning = true;
  console.log('[WebhookQueue] Starting webhook retry service');
  
  const poll = async () => {
    if (!isRunning) return;
    
    try {
      const result = await processOnce();
      if (result.processed > 0) {
        console.log(`[WebhookQueue] Processed ${result.processed} jobs, ${result.succeeded} succeeded`);
      }
    } catch (e) {
      console.error('[WebhookQueue] Poll error:', e);
    }
    
    if (isRunning) {
      pollTimeout = setTimeout(poll, POLL_INTERVAL_MS);
    }
  };
  
  // Start polling after a short delay
  pollTimeout = setTimeout(poll, 10000);
}

/**
 * Stop the webhook retry service
 */
export function stop(): void {
  isRunning = false;
  if (pollTimeout) {
    clearTimeout(pollTimeout);
    pollTimeout = null;
  }
  console.log('[WebhookQueue] Stopped webhook retry service');
}

/**
 * Get queue statistics
 */
export async function stats(): Promise<{
  pending: number;
  completed: number;
  failed: number;
}> {
  if (!sql) {
    return { pending: 0, completed: 0, failed: 0 };
  }
  
  try {
    const result = await sql`
      SELECT
        COUNT(*) FILTER (WHERE completed_at IS NULL AND attempts < ${MAX_RETRIES}) as pending,
        COUNT(*) FILTER (WHERE completed_at IS NOT NULL AND last_error IS NULL) as completed,
        COUNT(*) FILTER (WHERE completed_at IS NOT NULL AND last_error IS NOT NULL) as failed
      FROM webhook_queue
    `;
    return {
      pending: Number(result[0]?.pending || 0),
      completed: Number(result[0]?.completed || 0),
      failed: Number(result[0]?.failed || 0),
    };
  } catch (e) {
    return { pending: 0, completed: 0, failed: 0 };
  }
}

export default {
  enqueue,
  start,
  stop,
  stats,
  processOnce,
};
