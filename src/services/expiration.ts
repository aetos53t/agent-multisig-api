/**
 * Proposal Expiration Service
 * 
 * Periodically checks for expired proposals and updates their status.
 * Optionally cleans up old completed/rejected/expired proposals.
 */

import sql from '../db';

// ═══════════════════════════════════════════════════════════════════
//                        CONFIGURATION
// ═══════════════════════════════════════════════════════════════════

const CHECK_INTERVAL_MS = 5 * 60 * 1000; // Check every 5 minutes
const CLEANUP_AGE_DAYS = 30; // Clean up proposals older than 30 days

let isRunning = false;
let checkTimeout: ReturnType<typeof setTimeout> | null = null;

// ═══════════════════════════════════════════════════════════════════
//                        EXPIRATION LOGIC
// ═══════════════════════════════════════════════════════════════════

/**
 * Mark expired proposals
 */
async function markExpired(): Promise<number> {
  if (!sql) return 0;
  
  try {
    const result = await sql`
      UPDATE proposals 
      SET status = 'expired'
      WHERE status = 'pending'
        AND expires_at < NOW()
      RETURNING id
    `;
    
    if (result.length > 0) {
      console.log(`[Expiration] Marked ${result.length} proposal(s) as expired`);
    }
    
    return result.length;
  } catch (e) {
    console.error('[Expiration] Error marking expired:', e);
    return 0;
  }
}

/**
 * Clean up old completed proposals (optional)
 */
async function cleanupOld(): Promise<number> {
  if (!sql) return 0;
  
  try {
    // Only clean up proposals that are in terminal states
    const result = await sql`
      DELETE FROM proposals
      WHERE status IN ('confirmed', 'rejected', 'expired')
        AND created_at < NOW() - INTERVAL '${CLEANUP_AGE_DAYS} days'
      RETURNING id
    `;
    
    if (result.length > 0) {
      console.log(`[Expiration] Cleaned up ${result.length} old proposal(s)`);
    }
    
    return result.length;
  } catch (e) {
    console.error('[Expiration] Error cleaning up:', e);
    return 0;
  }
}

/**
 * Run a single check cycle
 */
async function checkOnce(): Promise<{ expired: number; cleaned: number }> {
  const expired = await markExpired();
  const cleaned = await cleanupOld();
  return { expired, cleaned };
}

// ═══════════════════════════════════════════════════════════════════
//                        SERVICE CONTROL
// ═══════════════════════════════════════════════════════════════════

/**
 * Start the expiration service
 */
export function start(): void {
  if (isRunning) {
    console.log('[Expiration] Already running');
    return;
  }
  
  if (!sql) {
    console.log('[Expiration] No database, skipping expiration service');
    return;
  }
  
  isRunning = true;
  console.log('[Expiration] Starting expiration service');
  
  const check = async () => {
    if (!isRunning) return;
    
    try {
      await checkOnce();
    } catch (e) {
      console.error('[Expiration] Check error:', e);
    }
    
    if (isRunning) {
      checkTimeout = setTimeout(check, CHECK_INTERVAL_MS);
    }
  };
  
  // Start checking after a short delay
  checkTimeout = setTimeout(check, 15000);
}

/**
 * Stop the expiration service
 */
export function stop(): void {
  isRunning = false;
  if (checkTimeout) {
    clearTimeout(checkTimeout);
    checkTimeout = null;
  }
  console.log('[Expiration] Stopped expiration service');
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
  checkOnce,
};
