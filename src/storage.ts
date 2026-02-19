/**
 * In-Memory Storage
 * 
 * Shared storage for all routes.
 * Replace with database in production.
 */

import type { Agent, Multisig, Proposal } from './types';

// ═══════════════════════════════════════════════════════════════════
//                          STORES
// ═══════════════════════════════════════════════════════════════════

export const agents = new Map<string, Agent>();
export const multisigs = new Map<string, Multisig>();
export const proposals = new Map<string, Proposal>();

// ═══════════════════════════════════════════════════════════════════
//                          HELPERS
// ═══════════════════════════════════════════════════════════════════

export function getAgent(id: string): Agent | undefined {
  return agents.get(id);
}

export function getMultisig(id: string): Multisig | undefined {
  return multisigs.get(id);
}

export function getProposal(id: string): Proposal | undefined {
  return proposals.get(id);
}

export function getProposalsForMultisig(multisigId: string): Proposal[] {
  return Array.from(proposals.values()).filter(p => p.multisigId === multisigId);
}

export function getProposalsForAgent(agentId: string): Proposal[] {
  return Array.from(proposals.values()).filter(p => 
    p.requiredSigners.includes(agentId)
  );
}

export function getPendingProposalsForAgent(agentId: string): Proposal[] {
  return getProposalsForAgent(agentId).filter(p => 
    p.status === 'pending' && !p.signatures.find(s => s.agentId === agentId)
  );
}

export function getMultisigsForAgent(agentId: string): Multisig[] {
  return Array.from(multisigs.values()).filter(m => 
    m.agents.some(a => a.id === agentId)
  );
}

// ═══════════════════════════════════════════════════════════════════
//                          STATS
// ═══════════════════════════════════════════════════════════════════

export function getStats() {
  return {
    agents: agents.size,
    multisigs: multisigs.size,
    proposals: proposals.size,
    proposalsByStatus: {
      pending: Array.from(proposals.values()).filter(p => p.status === 'pending').length,
      ready: Array.from(proposals.values()).filter(p => p.status === 'ready').length,
      finalized: Array.from(proposals.values()).filter(p => p.status === 'finalized').length,
      broadcast: Array.from(proposals.values()).filter(p => p.status === 'broadcast').length,
      confirmed: Array.from(proposals.values()).filter(p => p.status === 'confirmed').length,
      rejected: Array.from(proposals.values()).filter(p => p.status === 'rejected').length,
      expired: Array.from(proposals.values()).filter(p => p.status === 'expired').length,
    },
  };
}

export default {
  agents,
  multisigs,
  proposals,
  getAgent,
  getMultisig,
  getProposal,
  getProposalsForMultisig,
  getProposalsForAgent,
  getPendingProposalsForAgent,
  getMultisigsForAgent,
  getStats,
};
