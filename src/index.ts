/**
 * Agent Multisig Coordination API
 * 
 * Main entry point for the Hono application.
 * 
 * Stack: Bun + Hono + PostgreSQL + @scure/btc-signer
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { prettyJSON } from 'hono/pretty-json';
import { secureHeaders } from 'hono/secure-headers';

import multisigsRouter from './routes/multisigs';
import proposalsRouter from './routes/proposals';
import agentsRouter from './routes/agents';
import webhooksRouter from './routes/webhooks';
import healthRouter from './routes/health';
import metricsRouter from './routes/metrics';
import { createAuthMiddleware } from './middleware/auth';
import { createRateLimitMiddleware } from './middleware/rateLimit';

// ═══════════════════════════════════════════════════════════════════
//                              APP
// ═══════════════════════════════════════════════════════════════════

const app = new Hono();

// ═══════════════════════════════════════════════════════════════════
//                           MIDDLEWARE
// ═══════════════════════════════════════════════════════════════════

// Security headers
app.use('*', secureHeaders());

// CORS
app.use('*', cors({
  origin: '*', // TODO: Restrict in production
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));

// Request logging
app.use('*', logger());

// Pretty JSON responses in development
if (process.env.NODE_ENV !== 'production') {
  app.use('*', prettyJSON());
}

// API key authentication (optional - allows anonymous if no keys configured)
app.use('*', createAuthMiddleware({
  publicRoutes: ['/health', '/metrics', '/'],
  allowAnonymousIfNoKeys: true,
}));

// Rate limiting (100 req/min per IP or API key)
app.use('*', createRateLimitMiddleware({
  max: 100,
  windowMs: 60 * 1000,
  skip: ['/health', '/metrics'],
}));

// ═══════════════════════════════════════════════════════════════════
//                            ROUTES
// ═══════════════════════════════════════════════════════════════════

// Health check
app.route('/health', healthRouter);

// Metrics (Prometheus-compatible)
app.route('/metrics', metricsRouter);

// API v1
const v1 = new Hono();
v1.route('/multisigs', multisigsRouter);
v1.route('/proposals', proposalsRouter);
v1.route('/agents', agentsRouter);
v1.route('/webhooks', webhooksRouter);

app.route('/v1', v1);

// Root redirect
app.get('/', (c) => {
  return c.json({
    name: 'Agent Multisig Coordination API',
    version: '0.1.0',
    docs: '/v1',
    health: '/health',
  });
});

// 404 handler
app.notFound((c) => {
  return c.json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Route not found: ${c.req.method} ${c.req.path}`,
    },
  }, 404);
});

// Error handler
app.onError((err, c) => {
  console.error('Unhandled error:', err);
  
  return c.json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: process.env.NODE_ENV === 'production' 
        ? 'An unexpected error occurred' 
        : err.message,
    },
  }, 500);
});

// ═══════════════════════════════════════════════════════════════════
//                            SERVER
// ═══════════════════════════════════════════════════════════════════

const port = parseInt(process.env.PORT || '3000', 10);

console.log(`
╔═══════════════════════════════════════════════════════════════════╗
║           Agent Multisig Coordination API v0.1.0                  ║
╠═══════════════════════════════════════════════════════════════════╣
║  Environment: ${(process.env.NODE_ENV || 'development').padEnd(46)}║
║  Port: ${port.toString().padEnd(53)}║
║  Network: ${(process.env.BITCOIN_NETWORK || 'mainnet').padEnd(50)}║
╚═══════════════════════════════════════════════════════════════════╝
`);

export default {
  port,
  fetch: app.fetch,
};
// Force redeploy 1771538120
