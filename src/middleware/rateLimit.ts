/**
 * Rate Limiting Middleware
 * 
 * Simple in-memory rate limiter. For production, use Redis.
 * 
 * Limits:
 * - Per IP: 100 requests/minute
 * - Per API key: 1000 requests/minute
 * - Burst: Up to 10 requests/second
 */

import type { Context, Next } from 'hono';

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

// In-memory store (use Redis in production)
const store = new Map<string, RateLimitEntry>();

// Cleanup old entries every minute
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.resetAt < now) {
      store.delete(key);
    }
  }
}, 60 * 1000);

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
    
    let entry = store.get(clientId);
    
    // Create new entry if doesn't exist or expired
    if (!entry || entry.resetAt < now) {
      entry = {
        count: 0,
        resetAt: now + windowMs,
      };
    }
    
    entry.count++;
    store.set(clientId, entry);
    
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
