/**
 * Health check routes
 */

import { Hono } from 'hono';
import { checkConnection, runMigrations } from '../db';
import repo from '../db/repository';
import confirmationService from '../services/confirmation';
import webhookQueueService from '../services/webhookQueue';
import expirationService from '../services/expiration';
import { roomManager } from '../services/rooms';

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
  const webhookStats = await webhookQueueService.stats();
  const confirmationStatus = confirmationService.status();
  const expirationStatus = expirationService.status();
  
  return c.json({
    status: dbConnected ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    version: '0.3.1',
    storage: stats.usingDatabase ? 'postgresql' : 'in-memory',
    checks: {
      database: dbConnected ? 'ok' : 'not-connected',
      migrations: migrationSuccess ? 'ok' : 'pending',
      confirmationTracking: confirmationStatus.running ? 'running' : 'stopped',
      webhookQueue: webhookStats.pending > 0 ? `${webhookStats.pending} pending` : 'ok',
      expirationCleanup: expirationStatus.running ? 'running' : 'stopped',
    },
    stats: {
      agents: stats.agents,
      multisigs: stats.multisigs,
      proposals: stats.proposals,
      webhooks: webhookStats,
      activeRooms: roomManager.getActiveRooms().length,
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
