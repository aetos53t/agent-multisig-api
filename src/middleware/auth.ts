/**
 * API Key Authentication Middleware
 * 
 * Simple API key validation for protecting routes.
 * Keys are stored as environment variables:
 * - API_KEYS: comma-separated list of valid keys
 * - ADMIN_API_KEY: key with full access
 * 
 * Header format: Authorization: Bearer <api_key>
 */

import type { Context, Next } from 'hono';

interface AuthConfig {
  /** Routes that don't require authentication */
  publicRoutes?: string[];
  /** Whether to allow anonymous access when no API_KEYS configured */
  allowAnonymousIfNoKeys?: boolean;
}

const defaultConfig: AuthConfig = {
  publicRoutes: ['/health', '/v1/health', '/'],
  allowAnonymousIfNoKeys: true,
};

/**
 * Create auth middleware
 */
export function createAuthMiddleware(config: AuthConfig = {}) {
  const { publicRoutes, allowAnonymousIfNoKeys } = { ...defaultConfig, ...config };
  
  // Parse API keys from env
  const apiKeys = new Set(
    (process.env.API_KEYS || '')
      .split(',')
      .map(k => k.trim())
      .filter(k => k.length > 0)
  );
  
  const adminKey = process.env.ADMIN_API_KEY?.trim();
  if (adminKey) {
    apiKeys.add(adminKey);
  }
  
  const hasKeys = apiKeys.size > 0;
  
  return async (c: Context, next: Next) => {
    // Skip auth for public routes
    const path = c.req.path;
    if (publicRoutes?.some(r => path === r || path.startsWith(r + '/'))) {
      return next();
    }
    
    // If no keys configured and anonymous access allowed, skip auth
    if (!hasKeys && allowAnonymousIfNoKeys) {
      c.set('authType', 'anonymous');
      return next();
    }
    
    // Get authorization header
    const authHeader = c.req.header('Authorization');
    
    if (!authHeader) {
      return c.json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Missing Authorization header',
        },
      }, 401);
    }
    
    // Parse Bearer token
    const [scheme, token] = authHeader.split(' ');
    
    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      return c.json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Invalid Authorization header format. Use: Bearer <api_key>',
        },
      }, 401);
    }
    
    // Validate key
    if (!apiKeys.has(token)) {
      return c.json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Invalid API key',
        },
      }, 401);
    }
    
    // Set auth context
    c.set('authType', token === adminKey ? 'admin' : 'api_key');
    c.set('apiKey', token);
    
    return next();
  };
}

/**
 * Require admin access
 */
export function requireAdmin() {
  return async (c: Context, next: Next) => {
    if (c.get('authType') !== 'admin') {
      return c.json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Admin access required',
        },
      }, 403);
    }
    return next();
  };
}

/**
 * Generate a secure API key
 */
export function generateApiKey(prefix: string = 'ams'): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const key = Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  return `${prefix}_${key}`;
}
