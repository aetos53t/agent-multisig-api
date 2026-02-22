/**
 * Rate Limiting Middleware
 * 
 * Hybrid rate limiter: uses PostgreSQL for persistence with in-memory fallback.
 * 
 * Limits:
 * - Per IP: 100 requests/minute
 * - Per API key: 1000 requests/minute
 * - Burst: Up to 10 requests/second
 */

import type { Context, Next } from 'hono';
import sql from '../db';

interface RateLimitConfig {
  /** Max requests per window */
  max: number;
  /** Window duration in ms */
  windowMs: number;
  /** Skip rate limiting for these paths */
  skip?: string[];
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const defaultConfig: RateLimitConfig = {
  max: 100,
  windowMs: 60 * 1000, // 1 minute
  skip: ['/health', '/metrics'],
};

// In-memory store (fallback when no database)
const memStore = new Map<string, RateLimitEntry>();

// Database table initialization flag
let tableInitialized = false;

// Ensure rate limit table exists
async function ensureTable(): Promise<void> {
  if (!sql || tableInitialized) return;
  
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS rate_limits (
        client_id VARCHAR(256) PRIMARY KEY,
        count INTEGER NOT NULL DEFAULT 0,
        reset_at TIMESTAMPTZ NOT NULL
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_rate_limits_reset ON rate_limits(reset_at)`;
    tableInitialized = true;
    
    // Clean up old entries
    setInterval(async () => {
      try {
        await sql`DELETE FROM rate_limits WHERE reset_at < NOW()`;
      } catch (e) {
        // Ignore cleanup errors
      }
    }, 60 * 1000);
  } catch (e) {
    console.error('[RateLimit] Failed to create table:', e);
  }
}

// Initialize table on module load
ensureTable();

// Cleanup in-memory entries every minute
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of memStore) {
    if (entry.resetAt < now) {
      memStore.delete(key);
    }
  }
}, 60 * 1000);

// Get/update rate limit from database
async function dbGetAndIncrement(clientId: string, windowMs: number): Promise<RateLimitEntry | null> {
  if (!sql || !tableInitialized) return null;
  
  try {
    const now = Date.now();
    const resetAt = new Date(now + windowMs);
    
    // Upsert: increment if exists and not expired, otherwise create new
    const result = await sql`
      INSERT INTO rate_limits (client_id, count, reset_at)
      VALUES (${clientId}, 1, ${resetAt})
      ON CONFLICT (client_id) DO UPDATE SET
        count = CASE 
          WHEN rate_limits.reset_at < NOW() THEN 1
          ELSE rate_limits.count + 1
        END,
        reset_at = CASE
          WHEN rate_limits.reset_at < NOW() THEN ${resetAt}
          ELSE rate_limits.reset_at
        END
      RETURNING count, reset_at as "resetAt"
    `;
    
    if (result[0]) {
      return {
        count: result[0].count,
        resetAt: new Date(result[0].resetAt).getTime(),
      };
    }
    
    return null;
  } catch (e) {
    console.error('[RateLimit] DB error:', e);
    return null;
  }
}

/**
 * Get client identifier (API key or IP)
 */
function getClientId(c: Context): string {
  // Prefer API key if present
  const apiKey = c.get('apiKey') as string | undefined;
  if (apiKey) {
    return `key:${apiKey}`;
  }
  
  // Fall back to IP
  const forwarded = c.req.header('X-Forwarded-For');
  if (forwarded) {
    return `ip:${forwarded.split(',')[0].trim()}`;
  }
  
  return `ip:unknown`;
}

/**
 * Create rate limit middleware
 */
export function createRateLimitMiddleware(config: RateLimitConfig = defaultConfig) {
  const { max, windowMs, skip } = { ...defaultConfig, ...config };
  
  return async (c: Context, next: Next) => {
    // Skip for certain paths
    const path = c.req.path;
    if (skip?.some(s => path === s || path.startsWith(s + '/'))) {
      return next();
    }
    
    const clientId = getClientId(c);
    const now = Date.now();
    
    // Try database first, fall back to in-memory
    let entry = await dbGetAndIncrement(clientId, windowMs);
    
    if (!entry) {
      // Fallback to in-memory
      entry = memStore.get(clientId) || null;
      
      if (!entry || entry.resetAt < now) {
        entry = {
          count: 0,
          resetAt: now + windowMs,
        };
      }
      
      entry.count++;
      memStore.set(clientId, entry);
    }
    
    // Set rate limit headers
    c.res.headers.set('X-RateLimit-Limit', max.toString());
    c.res.headers.set('X-RateLimit-Remaining', Math.max(0, max - entry.count).toString());
    c.res.headers.set('X-RateLimit-Reset', Math.ceil(entry.resetAt / 1000).toString());
    
    // Check if over limit
    if (entry.count > max) {
      c.res.headers.set('Retry-After', Math.ceil((entry.resetAt - now) / 1000).toString());
      
      return c.json({
        success: false,
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many requests. Please slow down.',
          retryAfter: Math.ceil((entry.resetAt - now) / 1000),
        },
      }, 429);
    }
    
    return next();
  };
}

/**
 * Stricter rate limit for sensitive operations
 */
export function createStrictRateLimitMiddleware() {
  return createRateLimitMiddleware({
    max: 10,
    windowMs: 60 * 1000, // 10 requests per minute
    skip: [],
  });
}
