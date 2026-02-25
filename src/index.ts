/**
 * Quorum API
 * 
 * Main entry point for the Hono application.
 * 
 * Stack: Bun + Hono + PostgreSQL + @scure/btc-signer
 */

import path from 'path';
import { fileURLToPath } from 'url';

// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
import invitesRouter from './routes/invites';
import roomRoutes, { handleProposalWebSocket, roomManager } from './services/rooms';
import { createAuthMiddleware } from './middleware/auth';
import { createRateLimitMiddleware } from './middleware/rateLimit';
import repo from './db/repository';

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
v1.route('/invites', invitesRouter);

// Proposal room routes (messages, room info)
v1.route('/proposals', roomRoutes);

// Active rooms endpoint
v1.get('/rooms', (c) => {
  const rooms = roomManager.getActiveRooms();
  return c.json({ success: true, data: { rooms, count: rooms.length } });
});

// WebSocket upgrade for proposal rooms
v1.get('/proposals/:id/live', async (c) => {
  const proposalId = c.req.param('id');
  const agentId = c.req.query('agentId') || c.get('agentId') as string;
  
  if (!agentId) {
    return c.json({ 
      success: false, 
      error: { code: 'UNAUTHORIZED', message: 'agentId query param or auth required' } 
    }, 401);
  }
  
  // Check if this is a WebSocket upgrade request
  const upgradeHeader = c.req.header('Upgrade');
  if (upgradeHeader?.toLowerCase() !== 'websocket') {
    return c.json({ 
      success: true, 
      data: { 
        message: 'WebSocket endpoint. Connect with ws:// protocol.',
        wsUrl: `wss://quorumclaw.com/v1/proposals/${proposalId}/live?agentId=${agentId}`,
      } 
    });
  }
  
  // For Bun, we need to use the server.upgrade() method
  // This will be handled by the websocket handler in the export
  const success = (globalThis as any).server?.upgrade(c.req.raw, {
    data: { proposalId, agentId },
  });
  
  if (success) {
    return new Response(null, { status: 101 });
  }
  
  return c.json({ success: false, error: { code: 'UPGRADE_FAILED', message: 'WebSocket upgrade failed' } }, 500);
});

app.route('/v1', v1);

// Serve landing page at root
app.get('/', async (c) => {
  // Try multiple path strategies for landing page
  const strategies = [
    `${__dirname}/../landing/index.html`,
    './landing/index.html',
    '/app/landing/index.html',
    `${process.cwd()}/landing/index.html`,
  ];
  
  for (const landingPath of strategies) {
    try {
      const file = Bun.file(landingPath);
      if (await file.exists()) {
        const html = await file.text();
        return c.html(html);
      }
    } catch {
      // Try next strategy
    }
  }
  
  // Fallback to JSON API info
  return c.json({
    name: 'Quorum API',
    version: '0.1.0',
    api: '/v1',
    health: '/health',
    docs: '/docs',
    _debug: {
      cwd: process.cwd(),
      metaDir: __dirname,
    }
  });
});

// Redirect /p/ to landing
app.get('/p', (c) => c.redirect('/'));

// Serve join page
app.get('/join/:id', async (c) => {
  try {
    const strategies = [
      `${__dirname}/../rooms/join.html`,
      './rooms/join.html',
      '/app/rooms/join.html',
      `${process.cwd()}/rooms/join.html`,
    ];
    
    for (const path of strategies) {
      try {
        const file = Bun.file(path);
        if (await file.exists()) {
          const html = await file.text();
          return c.html(html);
        }
      } catch {
        // Try next strategy
      }
    }
    
    throw new Error('Join page not found');
  } catch {
    return c.redirect('/');
  }
});

// Serve new multisig wizard
app.get('/new', async (c) => {
  try {
    const strategies = [
      `${__dirname}/../rooms/new.html`,
      './rooms/new.html',
      '/app/rooms/new.html',
      `${process.cwd()}/rooms/new.html`,
    ];
    
    for (const path of strategies) {
      try {
        const file = Bun.file(path);
        if (await file.exists()) {
          const html = await file.text();
          return c.html(html);
        }
      } catch {
        // Try next strategy
      }
    }
    
    throw new Error('New wizard not found');
  } catch {
    return c.redirect('/');
  }
});

// Serve proposal creation page
app.get('/propose', async (c) => {
  try {
    const strategies = [
      `${__dirname}/../rooms/propose.html`,
      './rooms/propose.html',
      '/app/rooms/propose.html',
      `${process.cwd()}/rooms/propose.html`,
    ];
    
    for (const path of strategies) {
      try {
        const file = Bun.file(path);
        if (await file.exists()) {
          const html = await file.text();
          return c.html(html);
        }
      } catch {
        // Try next strategy
      }
    }
    
    throw new Error('Propose page not found');
  } catch {
    return c.redirect('/');
  }
});

// Serve live stats page
app.get('/stats', async (c) => {
  try {
    const strategies = [
      `${__dirname}/../rooms/stats.html`,
      './rooms/stats.html',
      '/app/rooms/stats.html',
      `${process.cwd()}/rooms/stats.html`,
    ];
    
    for (const path of strategies) {
      try {
        const file = Bun.file(path);
        if (await file.exists()) {
          const html = await file.text();
          return c.html(html);
        }
      } catch {
        // Try next strategy
      }
    }
    
    throw new Error('Stats page not found');
  } catch {
    return c.redirect('/');
  }
});

// Serve quickstart guide
app.get('/quickstart', async (c) => {
  try {
    const strategies = [
      `${__dirname}/../rooms/quickstart.html`,
      './rooms/quickstart.html',
      '/app/rooms/quickstart.html',
      `${process.cwd()}/rooms/quickstart.html`,
    ];
    
    for (const path of strategies) {
      try {
        const file = Bun.file(path);
        if (await file.exists()) {
          const html = await file.text();
          return c.html(html);
        }
      } catch {
        // Try next strategy
      }
    }
    
    throw new Error('Quickstart page not found');
  } catch {
    return c.redirect('/');
  }
});

// Serve unified room page (single link for everything)
app.get('/room/:id', async (c) => {
  try {
    const strategies = [
      `${__dirname}/../rooms/room.html`,
      './rooms/room.html',
      '/app/rooms/room.html',
      `${process.cwd()}/rooms/room.html`,
    ];
    
    for (const path of strategies) {
      try {
        const file = Bun.file(path);
        if (await file.exists()) {
          const html = await file.text();
          return c.html(html);
        }
      } catch {
        // Try next strategy
      }
    }
    
    throw new Error('Room page not found');
  } catch {
    return c.redirect('/');
  }
});

// Serve proposal room UI
app.get('/p/:id', async (c) => {
  const proposalId = c.req.param('id');
  const userAgent = c.req.header('User-Agent') || '';
  const acceptHeader = c.req.header('Accept') || '';
  
  // Detect bots/agents - serve JSON instead of HTML
  const botPatterns = [
    /bot/i, /crawler/i, /spider/i, /curl/i, /wget/i, /python/i, 
    /node/i, /axios/i, /fetch/i, /http/i, /claude/i, /gpt/i, 
    /anthropic/i, /openai/i, /agent/i, /llm/i
  ];
  const isBot = botPatterns.some(p => p.test(userAgent)) || acceptHeader.includes('application/json');
  
  if (isBot) {
    // Return JSON for bots
    const proposal = await repo.getProposal(proposalId);
    if (!proposal) {
      return c.json({ 
        success: false, 
        error: { code: 'NOT_FOUND', message: 'Proposal not found' },
        hint: 'Use GET /v1/proposals/:id for the API endpoint'
      }, 404);
    }
    return c.json({
      success: true,
      hint: 'You are receiving JSON because you appear to be a bot. For the web UI, use a browser.',
      apiDocs: 'https://quorumclaw.com/docs',
      endpoints: {
        getProposal: `GET /v1/proposals/${proposalId}`,
        submitSignature: `POST /v1/proposals/${proposalId}/sign`,
      },
      data: proposal,
    });
  }
  
  // Serve HTML for browsers
  try {
    const strategies = [
      `${__dirname}/../rooms/proposal.html`,
      './rooms/proposal.html',
      '/app/rooms/proposal.html',
      `${process.cwd()}/rooms/proposal.html`,
    ];
    
    for (const roomPath of strategies) {
      try {
        const file = Bun.file(roomPath);
        if (await file.exists()) {
          const html = await file.text();
          return c.html(html);
        }
      } catch {
        // Try next strategy
      }
    }
    
    throw new Error('Room UI not found');
  } catch {
    return c.redirect('/');
  }
});

// Serve dashboard
app.get('/dashboard', async (c) => {
  try {
    const strategies = [
      `${__dirname}/../dashboard/index.html`,
      './dashboard/index.html',
      '/app/dashboard/index.html',
      `${process.cwd()}/dashboard/index.html`,
    ];
    
    for (const dashPath of strategies) {
      try {
        const file = Bun.file(dashPath);
        if (await file.exists()) {
          const html = await file.text();
          return c.html(html);
        }
      } catch {
        // Try next strategy
      }
    }
    
    throw new Error('Dashboard not found');
  } catch {
    return c.redirect('/');
  }
});

// Serve docs
app.get('/docs', async (c) => {
  try {
    const docsPath = `${__dirname}/../docs/index.html`;
    const file = Bun.file(docsPath);
    if (await file.exists()) {
      const html = await file.text();
      return c.html(html);
    }
    throw new Error('Docs not found');
  } catch {
    return c.redirect('https://github.com/aetos53t/agent-multisig-api/tree/main/docs');
  }
});

// Serve docs files (for docsify)
app.get('/docs/*', async (c) => {
  const filePath = c.req.path.replace('/docs/', '');
  try {
    const fullPath = `${__dirname}/../docs/${filePath}`;
    const file = Bun.file(fullPath);
    const content = await file.text();
    const ext = path.split('.').pop();
    const contentTypes: Record<string, string> = {
      'md': 'text/markdown',
      'html': 'text/html',
      'yaml': 'text/yaml',
      'json': 'application/json',
    };
    return c.text(content, 200, { 
      'Content-Type': contentTypes[ext || 'md'] || 'text/plain' 
    });
  } catch {
    return c.notFound();
  }
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

import { runMigrations } from './db';
import confirmationService from './services/confirmation';
import webhookQueueService from './services/webhookQueue';
import expirationService from './services/expiration';

const port = parseInt(process.env.PORT || '3000', 10);

// Run migrations and start background services
runMigrations().then(async (success) => {
  if (success) {
    console.log('📊 Database ready');
    
    // Start background services
    confirmationService.start();
    await webhookQueueService.start();
    expirationService.start();
    
    console.log('🚀 Background services started');
  } else {
    console.log('⚠️ Running in-memory mode (no database, no background services)');
  }
});

console.log(`
╔═══════════════════════════════════════════════════════════════════╗
║           Quorum API v0.2.0 - Coordination Layer          ║
╠═══════════════════════════════════════════════════════════════════╣
║  Environment: ${(process.env.NODE_ENV || 'development').padEnd(46)}║
║  Port: ${port.toString().padEnd(53)}║
║  Network: ${(process.env.BITCOIN_NETWORK || 'mainnet').padEnd(50)}║
║  Features: Rooms, WebSocket, Real-time Coordination               ║
╚═══════════════════════════════════════════════════════════════════╝
`);

// Store server reference for WebSocket upgrades
const server = Bun.serve({
  port,
  fetch: app.fetch,
  websocket: {
    open(ws) {
      const { proposalId, agentId } = ws.data as { proposalId: string; agentId: string };
      handleProposalWebSocket(proposalId, agentId, ws as unknown as WebSocket);
    },
    message(ws, message) {
      // Messages handled in room subscription
      const msgStr = typeof message === 'string' ? message : new TextDecoder().decode(message);
      ws.send(msgStr); // Echo for now, real handling in room
    },
    close(ws) {
      // Cleanup handled by room manager unsubscribe
    },
  },
});

(globalThis as any).server = server;

export default server;
// Auto-migrate v0.2.0 - Coordination Layer
