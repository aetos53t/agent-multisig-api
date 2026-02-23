/**
 * Proposal Rooms - Real-time coordination for PSBT signing
 * 
 * Each proposal becomes a "room" where participants can:
 * - Send messages to coordinate signing
 * - Receive real-time updates on signatures and status
 * - See system events (signature received, threshold reached, etc.)
 */

import { Hono } from 'hono';
import type { Context } from 'hono';
import repo from '../db/repository';

// ═══════════════════════════════════════════════════════════════════
//                              TYPES
// ═══════════════════════════════════════════════════════════════════

export interface RoomMessage {
  id: string;
  proposalId: string;
  type: 'agent' | 'system';
  agentId?: string;
  agentName?: string;
  content: string;
  metadata?: Record<string, any>;
  createdAt: string;
}

interface RoomSubscriber {
  agentId: string;
  send: (data: any) => void;
}

// ═══════════════════════════════════════════════════════════════════
//                         ROOM MANAGER
// ═══════════════════════════════════════════════════════════════════

class RoomManager {
  // proposalId -> Set of subscribers
  private rooms = new Map<string, Set<RoomSubscriber>>();
  
  // In-memory message store (will add DB persistence)
  private messages = new Map<string, RoomMessage[]>();
  
  /**
   * Subscribe to a proposal room
   */
  subscribe(proposalId: string, subscriber: RoomSubscriber): () => void {
    if (!this.rooms.has(proposalId)) {
      this.rooms.set(proposalId, new Set());
    }
    this.rooms.get(proposalId)!.add(subscriber);
    
    console.log(`[Room] ${subscriber.agentId} joined room ${proposalId.slice(0, 8)}`);
    
    // Return unsubscribe function
    return () => {
      this.rooms.get(proposalId)?.delete(subscriber);
      console.log(`[Room] ${subscriber.agentId} left room ${proposalId.slice(0, 8)}`);
      
      // Cleanup empty rooms
      if (this.rooms.get(proposalId)?.size === 0) {
        this.rooms.delete(proposalId);
      }
    };
  }
  
  /**
   * Broadcast message to all subscribers in a room
   */
  broadcast(proposalId: string, message: RoomMessage): void {
    // Store message
    if (!this.messages.has(proposalId)) {
      this.messages.set(proposalId, []);
    }
    this.messages.get(proposalId)!.push(message);
    
    // Broadcast to subscribers
    const room = this.rooms.get(proposalId);
    if (room) {
      const payload = JSON.stringify({ type: 'message', message });
      room.forEach(sub => {
        try {
          sub.send(payload);
        } catch (e) {
          console.error(`[Room] Failed to send to ${sub.agentId}:`, e);
        }
      });
    }
  }
  
  /**
   * Get message history for a proposal
   */
  getMessages(proposalId: string, limit = 100): RoomMessage[] {
    return (this.messages.get(proposalId) || []).slice(-limit);
  }
  
  /**
   * Get room stats
   */
  getRoomStats(proposalId: string): { subscribers: number; messageCount: number } {
    return {
      subscribers: this.rooms.get(proposalId)?.size || 0,
      messageCount: this.messages.get(proposalId)?.length || 0,
    };
  }
  
  /**
   * Post a system message to a room
   */
  systemMessage(proposalId: string, content: string, metadata?: Record<string, any>): void {
    const message: RoomMessage = {
      id: crypto.randomUUID(),
      proposalId,
      type: 'system',
      content,
      metadata,
      createdAt: new Date().toISOString(),
    };
    this.broadcast(proposalId, message);
  }
  
  /**
   * Post an agent message to a room
   */
  agentMessage(
    proposalId: string, 
    agentId: string, 
    agentName: string, 
    content: string
  ): RoomMessage {
    const message: RoomMessage = {
      id: crypto.randomUUID(),
      proposalId,
      type: 'agent',
      agentId,
      agentName,
      content,
      createdAt: new Date().toISOString(),
    };
    this.broadcast(proposalId, message);
    return message;
  }
  
  /**
   * Get all active rooms
   */
  getActiveRooms(): Array<{ proposalId: string; subscribers: number; messageCount: number }> {
    return Array.from(this.rooms.entries()).map(([proposalId, subs]) => ({
      proposalId,
      subscribers: subs.size,
      messageCount: this.messages.get(proposalId)?.length || 0,
    }));
  }
}

// Singleton instance
export const roomManager = new RoomManager();

// ═══════════════════════════════════════════════════════════════════
//                         HTTP ROUTES
// ═══════════════════════════════════════════════════════════════════

const roomRoutes = new Hono();

/**
 * GET /proposals/:id/messages
 * Get message history for a proposal room
 */
roomRoutes.get('/:id/messages', async (c) => {
  const proposalId = c.req.param('id');
  const limit = parseInt(c.req.query('limit') || '100');
  
  // Verify proposal exists
  const proposal = await repo.getProposal(proposalId);
  if (!proposal) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Proposal not found' } }, 404);
  }
  
  const messages = roomManager.getMessages(proposalId, limit);
  const stats = roomManager.getRoomStats(proposalId);
  
  return c.json({
    success: true,
    data: {
      proposalId,
      messages,
      ...stats,
    },
  });
});

/**
 * POST /proposals/:id/messages
 * Send a message to a proposal room
 */
roomRoutes.post('/:id/messages', async (c) => {
  const proposalId = c.req.param('id');
  
  // Get agent from auth context
  const agentId = c.get('agentId') as string | undefined;
  if (!agentId) {
    return c.json({ 
      success: false, 
      error: { code: 'UNAUTHORIZED', message: 'Agent authentication required' } 
    }, 401);
  }
  
  // Verify proposal exists
  const proposal = await repo.getProposal(proposalId);
  if (!proposal) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Proposal not found' } }, 404);
  }
  
  // Verify agent is a participant
  const multisig = await repo.getMultisig(proposal.multisigId);
  if (!multisig) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Multisig not found' } }, 404);
  }
  
  const isParticipant = multisig.agents?.some(a => a.id === agentId);
  if (!isParticipant) {
    return c.json({ 
      success: false, 
      error: { code: 'FORBIDDEN', message: 'You are not a participant in this multisig' } 
    }, 403);
  }
  
  // Get message content
  const body = await c.req.json<{ content: string }>();
  if (!body.content || typeof body.content !== 'string') {
    return c.json({ 
      success: false, 
      error: { code: 'BAD_REQUEST', message: 'Message content required' } 
    }, 400);
  }
  
  // Limit message length
  const content = body.content.slice(0, 2000);
  
  // Get agent name
  const agent = await repo.getAgent(agentId);
  const agentName = agent?.name || agentId;
  
  // Send message
  const message = roomManager.agentMessage(proposalId, agentId, agentName, content);
  
  return c.json({
    success: true,
    data: message,
  });
});

/**
 * GET /proposals/:id/room
 * Get room info (subscribers, stats)
 */
roomRoutes.get('/:id/room', async (c) => {
  const proposalId = c.req.param('id');
  
  // Verify proposal exists
  const proposal = await repo.getProposal(proposalId);
  if (!proposal) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Proposal not found' } }, 404);
  }
  
  const stats = roomManager.getRoomStats(proposalId);
  
  return c.json({
    success: true,
    data: {
      proposalId,
      status: proposal.status,
      ...stats,
      wsUrl: `/v1/proposals/${proposalId}/live`,
    },
  });
});

export default roomRoutes;

// ═══════════════════════════════════════════════════════════════════
//                      WEBSOCKET HANDLER
// ═══════════════════════════════════════════════════════════════════

/**
 * WebSocket upgrade handler for proposal rooms
 * 
 * Usage: ws://host/v1/proposals/:id/live?agentId=xxx
 */
export async function handleProposalWebSocket(
  proposalId: string,
  agentId: string,
  ws: WebSocket
): Promise<void> {
  // Verify proposal exists
  const proposal = await repo.getProposal(proposalId);
  if (!proposal) {
    ws.close(4004, 'Proposal not found');
    return;
  }
  
  // Verify agent is a participant
  const multisig = await repo.getMultisig(proposal.multisigId);
  if (!multisig) {
    ws.close(4004, 'Multisig not found');
    return;
  }
  
  const isParticipant = multisig.agents?.some(a => a.id === agentId);
  if (!isParticipant) {
    ws.close(4003, 'Not a participant');
    return;
  }
  
  // Get agent name
  const agent = await repo.getAgent(agentId);
  const agentName = agent?.name || agentId;
  
  // Subscribe to room
  const unsubscribe = roomManager.subscribe(proposalId, {
    agentId,
    send: (data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    },
  });
  
  // Send welcome message with history
  const history = roomManager.getMessages(proposalId, 50);
  ws.send(JSON.stringify({
    type: 'welcome',
    proposalId,
    agentId,
    agentName,
    proposal: {
      status: proposal.status,
      signatureCount: proposal.signatures?.length || 0,
      threshold: multisig.threshold,
    },
    history,
  }));
  
  // Announce join
  roomManager.systemMessage(proposalId, `${agentName} joined the room`);
  
  // Handle incoming messages (Bun uses onmessage, not addEventListener)
  ws.onmessage = async (event: any) => {
    try {
      const data = JSON.parse(event.data as string);
      
      if (data.type === 'message' && data.content) {
        const content = String(data.content).slice(0, 2000);
        roomManager.agentMessage(proposalId, agentId, agentName, content);
      }
      
      if (data.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong', ts: Date.now() }));
      }
    } catch (e) {
      console.error('[Room] Message parse error:', e);
    }
  };
  
  // Handle disconnect (Bun uses onclose)
  ws.onclose = () => {
    unsubscribe();
    roomManager.systemMessage(proposalId, `${agentName} left the room`);
  };
  
  ws.onerror = (e: any) => {
    console.error('[Room] WebSocket error:', e);
    unsubscribe();
  };
}

// ═══════════════════════════════════════════════════════════════════
//                    SYSTEM EVENT HOOKS
// ═══════════════════════════════════════════════════════════════════

/**
 * Called when a signature is added to a proposal
 */
export function onSignatureAdded(
  proposalId: string, 
  agentId: string, 
  agentName: string,
  signatureCount: number,
  threshold: number
): void {
  roomManager.systemMessage(
    proposalId, 
    `✓ Signature received from ${agentName} (${signatureCount}/${threshold})`,
    { event: 'signature_added', agentId, signatureCount, threshold }
  );
  
  if (signatureCount >= threshold) {
    roomManager.systemMessage(
      proposalId,
      `🎉 Threshold reached! Proposal ready for finalization.`,
      { event: 'threshold_reached' }
    );
  }
}

/**
 * Called when a proposal status changes
 */
export function onProposalStatusChanged(
  proposalId: string,
  oldStatus: string,
  newStatus: string,
  txid?: string
): void {
  const messages: Record<string, string> = {
    'ready': '✓ Proposal ready for finalization',
    'finalized': '✓ Transaction finalized',
    'broadcast': txid ? `📡 Transaction broadcast: ${txid}` : '📡 Transaction broadcast',
    'confirmed': txid ? `✅ Transaction confirmed: ${txid}` : '✅ Transaction confirmed',
    'rejected': '❌ Proposal rejected',
    'expired': '⏰ Proposal expired',
  };
  
  const message = messages[newStatus] || `Status changed to ${newStatus}`;
  roomManager.systemMessage(proposalId, message, { 
    event: 'status_changed', 
    oldStatus, 
    newStatus, 
    txid 
  });
}

/**
 * Called when a new proposal is created
 */
export function onProposalCreated(
  proposalId: string,
  creatorName: string,
  note?: string
): void {
  roomManager.systemMessage(
    proposalId,
    `📋 Proposal created by ${creatorName}${note ? `: ${note}` : ''}`,
    { event: 'proposal_created', creatorName, note }
  );
}
