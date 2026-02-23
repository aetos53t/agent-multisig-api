/**
 * Invite Routes - Pending multisig creation with shareable links
 * 
 * Flow:
 * 1. Creator calls POST /invites to create pending multisig
 * 2. Gets invite link to share: /join/{inviteId}
 * 3. Each signer opens link and POSTs /invites/:id/join with their pubkey
 * 4. When all slots filled, multisig is created and address generated
 */

import { Hono } from 'hono';
import { z } from 'zod';
import repo from '../db/repository';
import { createP2TRMultisig } from '../services/taproot';

const router = new Hono();

// In-memory store for pending multisigs (would be DB in production)
interface PendingSlot {
  name?: string;
  publicKey?: string;
  joinedAt?: string;
  sessionId?: string;
}

interface PendingMultisig {
  id: string;
  name: string;
  chainId: string;
  threshold: number;
  slots: PendingSlot[];
  createdAt: string;
  createdBy?: string;
  // Once all slots filled:
  multisigId?: string;
  address?: string;
}

const pendingMultisigs = new Map<string, PendingMultisig>();

// Schema for creating invite
const createInviteSchema = z.object({
  name: z.string().min(1).max(100),
  chainId: z.enum(['bitcoin-mainnet', 'bitcoin-testnet', 'ethereum', 'base', 'solana']),
  threshold: z.number().int().min(2).max(10),
  totalSigners: z.number().int().min(2).max(10),
});

// Schema for joining
const joinSchema = z.object({
  name: z.string().min(1).max(100),
  publicKey: z.string().min(64).max(130),
});

/**
 * POST /invites - Create a new pending multisig invite
 */
router.post('/', async (c) => {
  try {
    const body = await c.req.json();
    const input = createInviteSchema.parse(body);
    
    if (input.threshold > input.totalSigners) {
      return c.json({
        success: false,
        error: { code: 'INVALID_THRESHOLD', message: 'Threshold cannot exceed total signers' },
      }, 400);
    }
    
    const id = crypto.randomUUID().slice(0, 8); // Short ID for easier sharing
    const slots: PendingSlot[] = Array(input.totalSigners).fill(null).map(() => ({}));
    
    const pending: PendingMultisig = {
      id,
      name: input.name,
      chainId: input.chainId,
      threshold: input.threshold,
      slots,
      createdAt: new Date().toISOString(),
    };
    
    pendingMultisigs.set(id, pending);
    
    const inviteUrl = `${c.req.url.split('/v1')[0]}/join/${id}`;
    
    return c.json({
      success: true,
      data: {
        inviteId: id,
        inviteUrl,
        ...pending,
      },
    });
    
  } catch (e: any) {
    if (e.name === 'ZodError') {
      return c.json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: e.errors[0].message },
      }, 400);
    }
    throw e;
  }
});

/**
 * GET /invites/:id - Get pending multisig details
 */
router.get('/:id', async (c) => {
  const id = c.req.param('id');
  const sessionId = c.req.header('X-Session-Id') || c.req.query('session');
  
  const pending = pendingMultisigs.get(id);
  
  if (!pending) {
    return c.json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Invite not found or expired' },
    }, 404);
  }
  
  // Mark which slot is "me" based on session
  const slotsWithMe = pending.slots.map(slot => ({
    ...slot,
    isMe: sessionId && slot.sessionId === sessionId,
  }));
  
  return c.json({
    success: true,
    data: {
      ...pending,
      slots: slotsWithMe,
    },
  });
});

/**
 * POST /invites/:id/join - Join as a signer
 */
router.post('/:id/join', async (c) => {
  const id = c.req.param('id');
  const sessionId = c.req.header('X-Session-Id') || crypto.randomUUID();
  
  const pending = pendingMultisigs.get(id);
  
  if (!pending) {
    return c.json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Invite not found or expired' },
    }, 404);
  }
  
  if (pending.address) {
    return c.json({
      success: false,
      error: { code: 'ALREADY_COMPLETE', message: 'Multisig already created' },
    }, 400);
  }
  
  try {
    const body = await c.req.json();
    const input = joinSchema.parse(body);
    
    // Check if pubkey already used
    const existingSlot = pending.slots.find(s => s.publicKey === input.publicKey);
    if (existingSlot) {
      return c.json({
        success: false,
        error: { code: 'DUPLICATE_KEY', message: 'This public key has already joined' },
      }, 400);
    }
    
    // Find empty slot
    const emptySlotIndex = pending.slots.findIndex(s => !s.publicKey);
    if (emptySlotIndex === -1) {
      return c.json({
        success: false,
        error: { code: 'FULL', message: 'All signer slots are filled' },
      }, 400);
    }
    
    // Fill slot
    pending.slots[emptySlotIndex] = {
      name: input.name,
      publicKey: input.publicKey,
      joinedAt: new Date().toISOString(),
      sessionId,
    };
    
    // Check if all slots filled
    const allFilled = pending.slots.every(s => s.publicKey);
    
    if (allFilled) {
      // Create the actual multisig
      try {
        // Register agents
        const agentIds: string[] = [];
        for (const slot of pending.slots) {
          const agentId = `invite-${id}-${slot.publicKey!.slice(0, 8)}`;
          await repo.createAgent({
            id: agentId,
            name: slot.name!,
            publicKey: slot.publicKey!,
            provider: 'custom',
          });
          agentIds.push(agentId);
        }
        
        // Generate address based on chain
        let address = '';
        if (pending.chainId.startsWith('bitcoin')) {
          const pubkeys = pending.slots.map(s => s.publicKey!);
          const result = createP2TRMultisig(pubkeys, pending.threshold, pending.chainId as any);
          address = result.address;
        } else {
          // EVM/Solana - would need to deploy contract
          address = `pending-${id}`;
        }
        
        // Create multisig record
        const multisigId = crypto.randomUUID();
        const multisigData = {
          id: multisigId,
          name: pending.name,
          chainId: pending.chainId as any,
          address,
          threshold: pending.threshold,
          createdBy: agentIds[0],
          createdAt: new Date(),
        };
        
        const agentPositions = agentIds.map((agentId, index) => ({
          agentId,
          position: index,
        }));
        
        const multisig = await repo.createMultisig(multisigData as any, agentPositions);
        
        pending.multisigId = multisig.id;
        pending.address = address;
        
      } catch (e: any) {
        console.error('Failed to create multisig:', e);
        // Rollback the slot
        pending.slots[emptySlotIndex] = {};
        return c.json({
          success: false,
          error: { code: 'CREATE_FAILED', message: e.message },
        }, 500);
      }
    }
    
    // Return updated state
    const slotsWithMe = pending.slots.map(slot => ({
      ...slot,
      isMe: slot.sessionId === sessionId,
    }));
    
    return c.json({
      success: true,
      data: {
        ...pending,
        slots: slotsWithMe,
      },
    });
    
  } catch (e: any) {
    if (e.name === 'ZodError') {
      return c.json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: e.errors[0].message },
      }, 400);
    }
    throw e;
  }
});

/**
 * GET /invites - List all pending invites (for dashboard)
 */
router.get('/', async (c) => {
  const invites = Array.from(pendingMultisigs.values()).map(p => ({
    id: p.id,
    name: p.name,
    chainId: p.chainId,
    threshold: p.threshold,
    filledSlots: p.slots.filter(s => s.publicKey).length,
    totalSlots: p.slots.length,
    ready: !!p.address,
    createdAt: p.createdAt,
  }));
  
  return c.json({
    success: true,
    data: invites,
  });
});

export default router;
