/**
 * Agent routes
 * 
 * POST   /agents           - Register a new agent
 * GET    /agents           - List all agents
 * GET    /agents/:id       - Get agent details
 * PUT    /agents/:id       - Update agent
 * GET    /agents/:id/multisigs - List multisigs for agent
 * GET    /agents/:id/proposals - List pending proposals for agent
 */

import { Hono } from 'hono';
import { z } from 'zod';
import type { Agent, ApiResponse } from '../types';
import { compressedToXOnly } from '../services/taproot';
import repo from '../db/repository';

const router = new Hono();

// ═══════════════════════════════════════════════════════════════════
//                          VALIDATION
// ═══════════════════════════════════════════════════════════════════

const RegisterAgentSchema = z.object({
  id: z.string().min(1).max(64).optional(), // Auto-generated if not provided
  name: z.string().min(1).max(256),
  publicKey: z.string().min(64).max(130),
  provider: z.enum(['aibtc', 'agentkit', 'crossmint', 'clawcash', 'bankr', 'custom']),
  webhookUrl: z.string().url().optional(),
  metadata: z.record(z.unknown()).optional(),
});

// ═══════════════════════════════════════════════════════════════════
//                            ROUTES
// ═══════════════════════════════════════════════════════════════════

/**
 * Register a new agent
 */
router.post('/', async (c) => {
  const body = await c.req.json();
  const parseResult = RegisterAgentSchema.safeParse(body);
  
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
  
  // Generate ID if not provided
  const agentId = input.id || `agent_${crypto.randomUUID().slice(0, 12)}`;
  
  // Check if agent already exists
  const existing = await repo.getAgent(agentId);
  if (existing) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: {
        code: 'ALREADY_EXISTS',
        message: `Agent ${agentId} already exists`,
      },
    }, 409);
  }
  
  // Convert to x-only pubkey
  let xOnlyPubkey: string | undefined;
  try {
    xOnlyPubkey = compressedToXOnly(input.publicKey);
  } catch (error) {
    // Not a valid compressed pubkey, might be already x-only or different format
  }
  
  const agent: Agent = {
    id: agentId,
    name: input.name,
    publicKey: input.publicKey,
    xOnlyPubkey,
    provider: input.provider,
    webhookUrl: input.webhookUrl,
    metadata: input.metadata,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  
  await repo.createAgent(agent);
  
  return c.json<ApiResponse<Agent>>({
    success: true,
    data: agent,
  }, 201);
});

/**
 * Get agent details
 */
router.get('/:id', async (c) => {
  const id = c.req.param('id');
  
  const agent = await repo.getAgent(id);
  if (!agent) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: `Agent not found: ${id}`,
      },
    }, 404);
  }
  
  return c.json<ApiResponse<Agent>>({
    success: true,
    data: agent,
  });
});

/**
 * Update agent
 */
router.put('/:id', async (c) => {
  const id = c.req.param('id');
  
  const agent = await repo.getAgent(id);
  if (!agent) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: `Agent not found: ${id}`,
      },
    }, 404);
  }
  
  const body = await c.req.json();
  
  // Update allowed fields
  if (body.name) agent.name = body.name;
  if (body.webhookUrl) agent.webhookUrl = body.webhookUrl;
  if (body.metadata) agent.metadata = { ...agent.metadata, ...body.metadata };
  agent.updatedAt = new Date();
  
  // Note: For full update support, add updateAgent to repository
  // For now, this works with in-memory fallback
  
  return c.json<ApiResponse<Agent>>({
    success: true,
    data: agent,
  });
});

/**
 * List multisigs for agent
 */
router.get('/:id/multisigs', async (c) => {
  const id = c.req.param('id');
  
  const agent = await repo.getAgent(id);
  if (!agent) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: `Agent not found: ${id}`,
      },
    }, 404);
  }
  
  const multisigs = await repo.getMultisigsForAgent(id);
  
  return c.json<ApiResponse<any[]>>({
    success: true,
    data: multisigs.map(m => ({
      id: m.id,
      name: m.name,
      address: m.address,
      chainId: m.chainId,
      threshold: m.threshold,
      agentCount: m.agents.length,
    })),
  });
});

/**
 * List pending proposals for agent
 */
router.get('/:id/proposals', async (c) => {
  const id = c.req.param('id');
  const status = c.req.query('status') || 'pending';
  
  const agent = await repo.getAgent(id);
  if (!agent) {
    return c.json<ApiResponse<never>>({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: `Agent not found: ${id}`,
      },
    }, 404);
  }
  
  const proposals = await repo.getPendingProposalsForAgent(id);
  
  return c.json<ApiResponse<any[]>>({
    success: true,
    data: proposals.map(p => ({
      id: p.id,
      multisigId: p.multisigId,
      status: p.status,
      outputs: p.outputs,
      createdAt: p.createdAt,
      expiresAt: p.expiresAt,
      signatureCount: p.signatures.length,
      requiredSigners: p.requiredSigners.length,
    })),
  });
});

/**
 * List all agents
 */
router.get('/', async (c) => {
  const all = await repo.listAgents();
  
  return c.json<ApiResponse<Agent[]>>({
    success: true,
    data: all,
  });
});

export default router;
