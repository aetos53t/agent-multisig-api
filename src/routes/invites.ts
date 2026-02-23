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
import sql from '../db';
import { createP2TRMultisig } from '../services/taproot';

const router = new Hono();

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
  if (!sql) {
    return c.json({ success: false, error: { code: 'NO_DB', message: 'Database not available' } }, 500);
  }
  
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
    
    // Create invite
    await sql`
      INSERT INTO invites (id, name, chain_id, threshold, total_slots)
      VALUES (${id}, ${input.name}, ${input.chainId}, ${input.threshold}, ${input.totalSigners})
    `;
    
    // Create empty slots
    for (let i = 0; i < input.totalSigners; i++) {
      await sql`INSERT INTO invite_slots (invite_id, slot_index) VALUES (${id}, ${i})`;
    }
    
    const inviteUrl = `${c.req.url.split('/v1')[0]}/join/${id}`;
    
    return c.json({
      success: true,
      data: {
        inviteId: id,
        inviteUrl,
        id,
        name: input.name,
        chainId: input.chainId,
        threshold: input.threshold,
        slots: Array(input.totalSigners).fill({}),
        createdAt: new Date().toISOString(),
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
  if (!sql) {
    return c.json({ success: false, error: { code: 'NO_DB', message: 'Database not available' } }, 500);
  }
  
  const id = c.req.param('id');
  const sessionId = c.req.header('X-Session-Id') || c.req.query('session');
  
  // Get invite
  const invites = await sql`SELECT * FROM invites WHERE id = ${id}`;
  
  if (invites.length === 0) {
    return c.json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Invite not found or expired' },
    }, 404);
  }
  
  const invite = invites[0];
  
  // Get slots
  const slotsRows = await sql`
    SELECT * FROM invite_slots WHERE invite_id = ${id} ORDER BY slot_index
  `;
  
  const slots = slotsRows.map(slot => ({
    name: slot.name || undefined,
    publicKey: slot.public_key || undefined,
    joinedAt: slot.joined_at?.toISOString() || undefined,
    sessionId: slot.session_id || undefined,
    isMe: sessionId && slot.session_id === sessionId,
  }));
  
  return c.json({
    success: true,
    data: {
      id: invite.id,
      name: invite.name,
      chainId: invite.chain_id,
      threshold: invite.threshold,
      slots,
      address: invite.address || undefined,
      multisigId: invite.multisig_id || undefined,
      createdAt: invite.created_at.toISOString(),
    },
  });
});

/**
 * POST /invites/:id/join - Join as a signer
 */
router.post('/:id/join', async (c) => {
  if (!sql) {
    return c.json({ success: false, error: { code: 'NO_DB', message: 'Database not available' } }, 500);
  }
  
  const id = c.req.param('id');
  const sessionId = c.req.header('X-Session-Id') || crypto.randomUUID();
  
  // Get invite
  const invites = await sql`SELECT * FROM invites WHERE id = ${id}`;
  
  if (invites.length === 0) {
    return c.json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Invite not found or expired' },
    }, 404);
  }
  
  const invite = invites[0];
  
  if (invite.address) {
    return c.json({
      success: false,
      error: { code: 'ALREADY_COMPLETE', message: 'Multisig already created' },
    }, 400);
  }
  
  try {
    const body = await c.req.json();
    const input = joinSchema.parse(body);
    
    // Check if pubkey already used
    const existing = await sql`
      SELECT * FROM invite_slots WHERE invite_id = ${id} AND public_key = ${input.publicKey}
    `;
    
    if (existing.length > 0) {
      return c.json({
        success: false,
        error: { code: 'DUPLICATE_KEY', message: 'This public key has already joined' },
      }, 400);
    }
    
    // Find empty slot
    const emptySlots = await sql`
      SELECT * FROM invite_slots 
      WHERE invite_id = ${id} AND public_key IS NULL 
      ORDER BY slot_index LIMIT 1
    `;
    
    if (emptySlots.length === 0) {
      return c.json({
        success: false,
        error: { code: 'FULL', message: 'All signer slots are filled' },
      }, 400);
    }
    
    const slotIndex = emptySlots[0].slot_index;
    
    // Fill slot
    await sql`
      UPDATE invite_slots 
      SET name = ${input.name}, public_key = ${input.publicKey}, session_id = ${sessionId}, joined_at = NOW()
      WHERE invite_id = ${id} AND slot_index = ${slotIndex}
    `;
    
    // Check if all slots filled
    const filledCount = await sql`
      SELECT COUNT(*)::int as filled FROM invite_slots 
      WHERE invite_id = ${id} AND public_key IS NOT NULL
    `;
    
    const allFilled = filledCount[0].filled === invite.total_slots;
    
    if (allFilled) {
      // Get all slots for multisig creation
      const allSlots = await sql`
        SELECT * FROM invite_slots WHERE invite_id = ${id} ORDER BY slot_index
      `;
      
      try {
        // Register agents
        const agentIds: string[] = [];
        for (const slot of allSlots) {
          const agentId = `invite-${id}-${slot.public_key.slice(0, 8)}`;
          await repo.createAgent({
            id: agentId,
            name: slot.name,
            publicKey: slot.public_key,
            provider: 'custom',
          });
          agentIds.push(agentId);
        }
        
        // Generate address based on chain
        let address = '';
        if (invite.chain_id.startsWith('bitcoin')) {
          const pubkeys = allSlots.map((s: any) => s.public_key);
          const result = createP2TRMultisig(pubkeys, invite.threshold, invite.chain_id as any);
          address = result.address;
        } else {
          // EVM/Solana - would need to deploy contract
          address = `pending-${id}`;
        }
        
        // Create multisig record
        const multisigId = crypto.randomUUID();
        const multisigData = {
          id: multisigId,
          name: invite.name,
          chainId: invite.chain_id as any,
          address,
          threshold: invite.threshold,
          createdBy: agentIds[0],
          createdAt: new Date(),
        };
        
        const agentPositions = agentIds.map((agentId, index) => ({
          agentId,
          position: index,
        }));
        
        const multisig = await repo.createMultisig(multisigData as any, agentPositions);
        
        // Update invite with final address
        await sql`
          UPDATE invites SET multisig_id = ${multisig.id}, address = ${address} WHERE id = ${id}
        `;
        
      } catch (e: any) {
        console.error('Failed to create multisig:', e);
        // Rollback the slot
        await sql`
          UPDATE invite_slots 
          SET name = NULL, public_key = NULL, session_id = NULL, joined_at = NULL
          WHERE invite_id = ${id} AND slot_index = ${slotIndex}
        `;
        return c.json({
          success: false,
          error: { code: 'CREATE_FAILED', message: e.message },
        }, 500);
      }
    }
    
    // Return updated state
    const slotsRows = await sql`
      SELECT * FROM invite_slots WHERE invite_id = ${id} ORDER BY slot_index
    `;
    
    const slots = slotsRows.map(slot => ({
      name: slot.name || undefined,
      publicKey: slot.public_key || undefined,
      joinedAt: slot.joined_at?.toISOString() || undefined,
      sessionId: slot.session_id || undefined,
      isMe: slot.session_id === sessionId,
    }));
    
    // Refetch invite for address
    const updatedInvites = await sql`SELECT * FROM invites WHERE id = ${id}`;
    const updatedInvite = updatedInvites[0];
    
    return c.json({
      success: true,
      data: {
        id: updatedInvite.id,
        name: updatedInvite.name,
        chainId: updatedInvite.chain_id,
        threshold: updatedInvite.threshold,
        slots,
        address: updatedInvite.address || undefined,
        multisigId: updatedInvite.multisig_id || undefined,
        createdAt: updatedInvite.created_at.toISOString(),
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
  if (!sql) {
    return c.json({ success: false, error: { code: 'NO_DB', message: 'Database not available' } }, 500);
  }
  
  const rows = await sql`
    SELECT i.*, 
      (SELECT COUNT(*)::int FROM invite_slots s WHERE s.invite_id = i.id AND s.public_key IS NOT NULL) as filled_slots
    FROM invites i
    ORDER BY i.created_at DESC
    LIMIT 100
  `;
  
  const invites = rows.map(row => ({
    id: row.id,
    name: row.name,
    chainId: row.chain_id,
    threshold: row.threshold,
    filledSlots: row.filled_slots,
    totalSlots: row.total_slots,
    ready: !!row.address,
    createdAt: row.created_at.toISOString(),
  }));
  
  return c.json({
    success: true,
    data: invites,
  });
});

export default router;
