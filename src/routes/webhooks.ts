/**
 * Webhook routes
 * 
 * POST   /webhooks              - Register a webhook
 * GET    /webhooks              - List webhooks for agent
 * GET    /webhooks/:id          - Get webhook details
 * DELETE /webhooks/:id          - Delete a webhook
 * POST   /webhooks/:id/test     - Send a test webhook
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { sha256 } from '@noble/hashes/sha256';
import { hex } from '@scure/base';
import type { ApiResponse, WebhookEvent, WebhookPayload } from '../types';

const router = new Hono();

// ═══════════════════════════════════════════════════════════════════
//                          TYPES
// ═══════════════════════════════════════════════════════════════════

interface Webhook {
  id: string;
  agentId: string;
  url: string;
  secret: string;
  events: WebhookEvent[];
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastTriggeredAt?: Date;
  failureCount: number;
}

// In-memory storage
const webhooks = new Map<string, Webhook>();

// ═══════════════════════════════════════════════════════════════════
//                          VALIDATION
// ═══════════════════════════════════════════════════════════════════

const WEBHOOK_EVENTS: WebhookEvent[] = [
  'proposal.created',
  'proposal.signed',
  'proposal.ready',
  'proposal.finalized',
  'proposal.broadcast',
  'proposal.confirmed',
  'proposal.rejected',
  'proposal.expired',
];

const RegisterWebhookSchema = z.object({
  agentId: z.string().min(1).max(64),
  url: z.string().url(),
  events: z.array(z.enum(WEBHOOK_EVENTS as [string, ...string[]])).min(1),
  secret: z.string().min(16).max(256),
});

// ═══════════════════════════════════════════════════════════════════
//                          HELPERS
// ═══════════════════════════════════════════════════════════════════

function computeSignature(payload: string, secret: string): string {
  const key = new TextEncoder().encode(secret);
  const data = new TextEncoder().encode(payload);
  // Simple HMAC-like signature (in production use proper HMAC)
  const combined = new Uint8Array(key.length + data.length);
  combined.set(key);
  combined.set(data, key.length);
  return hex.encode(sha256(combined));
}

export async function sendWebhook(
  webhook: Webhook,
  payload: WebhookPayload
): Promise<boolean> {
  const body = JSON.stringify(payload);
  const signature = computeSignature(body, webhook.secret);
  
  try {
    const response = await fetch(webhook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': signature,
        'X-Webhook-Event': payload.event,
        'X-Webhook-Timestamp': payload.timestamp.toISOString(),
      },
      body,
    });
    
    if (response.ok) {
      webhook.lastTriggeredAt = new Date();
      webhook.failureCount = 0;
      return true;
    } else {
      webhook.failureCount++;
      console.error(`Webhook failed: ${response.status} ${response.statusText}`);
      return false;
    }
  } catch (error) {
    webhook.failureCount++;
    console.error('Webhook error:', error);
    return false;
  }
}

export async function triggerWebhooks(
  event: WebhookEvent,
  data: WebhookPayload['data']
): Promise<void> {
  const payload: WebhookPayload = {
    event,
    timestamp: new Date(),
    data,
  };
  
  const matchingWebhooks = Array.from(webhooks.values()).filter(
    w => w.active && w.events.includes(event) && w.failureCount < 5
  );
  
  await Promise.all(matchingWebhooks.map(w => sendWebhook(w, payload)));
}

// ═══════════════════════════════════════════════════════════════════
//                            ROUTES
// ═══════════════════════════════════════════════════════════════════

/**
 * Register a webhook
 */
router.post('/', async (c) => {
  const body = await c.req.json();
  const parseResult = RegisterWebhookSchema.safeParse(body);
  
  if (!parseResult.success) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid input',
        details: parseResult.error.issues,
      },
    }, 400);
  }
  
  const input = parseResult.data;
  
  const webhook: Webhook = {
    id: crypto.randomUUID(),
    agentId: input.agentId,
    url: input.url,
    secret: input.secret,
    events: input.events as WebhookEvent[],
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    failureCount: 0,
  };
  
  webhooks.set(webhook.id, webhook);
  
  return c.json<ApiResponse<Omit<Webhook, 'secret'>>>({
    success: true,
    data: {
      ...webhook,
      secret: undefined as any,
    },
  }, 201);
});

/**
 * List webhooks for agent
 */
router.get('/', async (c) => {
  const agentId = c.req.query('agentId');
  
  let results = Array.from(webhooks.values());
  
  if (agentId) {
    results = results.filter(w => w.agentId === agentId);
  }
  
  return c.json<ApiResponse<Omit<Webhook, 'secret'>[]>>({
    success: true,
    data: results.map(w => ({
      ...w,
      secret: undefined as any,
    })),
  });
});

/**
 * Get webhook details
 */
router.get('/:id', async (c) => {
  const id = c.req.param('id');
  
  const webhook = webhooks.get(id);
  if (!webhook) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: `Webhook not found: ${id}`,
      },
    }, 404);
  }
  
  return c.json<ApiResponse<Omit<Webhook, 'secret'>>>({
    success: true,
    data: {
      ...webhook,
      secret: undefined as any,
    },
  });
});

/**
 * Update webhook
 */
router.put('/:id', async (c) => {
  const id = c.req.param('id');
  
  const webhook = webhooks.get(id);
  if (!webhook) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: `Webhook not found: ${id}`,
      },
    }, 404);
  }
  
  const body = await c.req.json();
  
  if (body.url) webhook.url = body.url;
  if (body.events) webhook.events = body.events;
  if (body.active !== undefined) webhook.active = body.active;
  if (body.secret) webhook.secret = body.secret;
  webhook.updatedAt = new Date();
  
  return c.json<ApiResponse<Omit<Webhook, 'secret'>>>({
    success: true,
    data: {
      ...webhook,
      secret: undefined as any,
    },
  });
});

/**
 * Delete a webhook
 */
router.delete('/:id', async (c) => {
  const id = c.req.param('id');
  
  const webhook = webhooks.get(id);
  if (!webhook) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: `Webhook not found: ${id}`,
      },
    }, 404);
  }
  
  webhooks.delete(id);
  
  return c.json<ApiResponse<{ deleted: boolean }>>({
    success: true,
    data: { deleted: true },
  });
});

/**
 * Send a test webhook
 */
router.post('/:id/test', async (c) => {
  const id = c.req.param('id');
  
  const webhook = webhooks.get(id);
  if (!webhook) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: `Webhook not found: ${id}`,
      },
    }, 404);
  }
  
  const testPayload: WebhookPayload = {
    event: 'proposal.created',
    timestamp: new Date(),
    data: {
      proposalId: 'test-proposal-id',
      multisigId: 'test-multisig-id',
      multisigName: 'Test Multisig',
      test: true,
    },
  };
  
  const success = await sendWebhook(webhook, testPayload);
  
  return c.json<ApiResponse<{ success: boolean; failureCount: number }>>({
    success: true,
    data: {
      success,
      failureCount: webhook.failureCount,
    },
  });
});

export default router;
