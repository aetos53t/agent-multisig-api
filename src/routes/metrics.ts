/**
 * Metrics endpoint for monitoring
 * 
 * Provides Prometheus-compatible metrics and JSON stats.
 */

import { Hono } from 'hono';
import repo from '../db/repository';

const router = new Hono();

// Track request counts
const requestCounts = new Map<string, number>();
const errorCounts = new Map<string, number>();
let lastReset = Date.now();

/**
 * Increment request count for a route
 */
export function trackRequest(path: string, method: string) {
  const key = `${method} ${path}`;
  requestCounts.set(key, (requestCounts.get(key) || 0) + 1);
}

/**
 * Increment error count
 */
export function trackError(code: string) {
  errorCounts.set(code, (errorCounts.get(code) || 0) + 1);
}

/**
 * Prometheus-format metrics
 */
router.get('/', async (c) => {
  const stats = await repo.getStats();
  const uptime = process.uptime();
  const memory = process.memoryUsage();
  
  const lines: string[] = [
    '# HELP ams_agents_total Total registered agents',
    '# TYPE ams_agents_total gauge',
    `ams_agents_total ${stats.agents}`,
    '',
    '# HELP ams_multisigs_total Total multisig wallets',
    '# TYPE ams_multisigs_total gauge',
    `ams_multisigs_total ${stats.multisigs}`,
    '',
    '# HELP ams_proposals_total Total proposals created',
    '# TYPE ams_proposals_total gauge',
    `ams_proposals_total ${stats.proposals}`,
    '',
    '# HELP ams_uptime_seconds Process uptime in seconds',
    '# TYPE ams_uptime_seconds counter',
    `ams_uptime_seconds ${Math.floor(uptime)}`,
    '',
    '# HELP ams_memory_heap_bytes Heap memory used',
    '# TYPE ams_memory_heap_bytes gauge',
    `ams_memory_heap_bytes ${memory.heapUsed}`,
    '',
    '# HELP ams_requests_total Total HTTP requests by route',
    '# TYPE ams_requests_total counter',
  ];
  
  for (const [route, count] of requestCounts) {
    const [method, path] = route.split(' ');
    lines.push(`ams_requests_total{method="${method}",path="${path}"} ${count}`);
  }
  
  lines.push('');
  lines.push('# HELP ams_errors_total Total errors by code');
  lines.push('# TYPE ams_errors_total counter');
  
  for (const [code, count] of errorCounts) {
    lines.push(`ams_errors_total{code="${code}"} ${count}`);
  }
  
  return c.text(lines.join('\n'));
});

/**
 * JSON format stats
 */
router.get('/json', async (c) => {
  const stats = await repo.getStats();
  const uptime = process.uptime();
  const memory = process.memoryUsage();
  
  return c.json({
    success: true,
    data: {
      timestamp: new Date().toISOString(),
      uptime: {
        seconds: Math.floor(uptime),
        formatted: formatUptime(uptime),
      },
      storage: stats,
      memory: {
        heapUsed: formatBytes(memory.heapUsed),
        heapTotal: formatBytes(memory.heapTotal),
        rss: formatBytes(memory.rss),
      },
      requests: {
        sinceLast: Date.now() - lastReset,
        counts: Object.fromEntries(requestCounts),
      },
      errors: Object.fromEntries(errorCounts),
    },
  });
});

/**
 * Reset counters (admin only in production)
 */
router.post('/reset', async (c) => {
  requestCounts.clear();
  errorCounts.clear();
  lastReset = Date.now();
  
  return c.json({
    success: true,
    message: 'Counters reset',
  });
});

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  parts.push(`${secs}s`);
  
  return parts.join(' ');
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default router;
