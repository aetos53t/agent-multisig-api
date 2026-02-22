/**
 * Health check routes
 */

import { Hono } from 'hono';
import { checkConnection, runMigrations } from '../db';
import repo from '../db/repository';

const router = new Hono();

// Run migrations on first health check
let migrationRun = false;
let migrationSuccess = false;

router.get('/', async (c) => {
  // Run migrations on first request
  if (!migrationRun) {
    migrationRun = true;
    migrationSuccess = await runMigrations();
  }
  
  const dbConnected = await checkConnection();
  const stats = await repo.getStats();
  
  return c.json({
    status: dbConnected ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    version: '0.1.2',
    storage: stats.usingDatabase ? 'postgresql' : 'in-memory',
    checks: {
      database: dbConnected ? 'ok' : 'not-connected',
      migrations: migrationSuccess ? 'ok' : 'pending',
    },
    stats: {
      agents: stats.agents,
      multisigs: stats.multisigs,
      proposals: stats.proposals,
    },
  });
});

router.get('/ready', async (c) => {
  // Readiness check - are we ready to serve traffic?
  // We're ready even without DB (falls back to in-memory)
  return c.json({ ready: true });
});

router.get('/live', async (c) => {
  // Liveness check - are we alive?
  return c.json({ alive: true });
});

export default router;
