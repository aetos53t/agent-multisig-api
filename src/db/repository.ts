/**
 * Data Repository
 * 
 * Provides data access layer with PostgreSQL or in-memory fallback.
 * Same interface as storage.ts for drop-in replacement.
 */

import sql from './index';
import type { Agent, Multisig, Proposal, SignatureEntry } from '../types';

// ═══════════════════════════════════════════════════════════════════
//                    IN-MEMORY FALLBACK
// ═══════════════════════════════════════════════════════════════════

const memAgents = new Map<string, Agent>();
const memMultisigs = new Map<string, Multisig>();
const memProposals = new Map<string, Proposal>();

// ═══════════════════════════════════════════════════════════════════
//                          AGENTS
// ═══════════════════════════════════════════════════════════════════

export async function createAgent(agent: Agent): Promise<Agent> {
  if (!sql) {
    memAgents.set(agent.id, agent);
    return agent;
  }

  await sql`
    INSERT INTO agents (id, name, public_key, x_only_pubkey, provider, webhook_url, metadata)
    VALUES (
      ${agent.id}, 
      ${agent.name}, 
      ${agent.publicKey},
      ${agent.xOnlyPubkey || null},
      ${agent.provider},
      ${agent.webhookUrl || null},
      ${JSON.stringify(agent.metadata || {})}
    )
  `;
  return agent;
}

export async function getAgent(id: string): Promise<Agent | null> {
  if (!sql) {
    return memAgents.get(id) || null;
  }

  const rows = await sql<Agent[]>`
    SELECT 
      id, name, 
      public_key as "publicKey", 
      x_only_pubkey as "xOnlyPubkey",
      provider, 
      webhook_url as "webhookUrl", 
      metadata,
      created_at as "createdAt",
      updated_at as "updatedAt"
    FROM agents WHERE id = ${id}
  `;
  return rows[0] || null;
}

export async function getAgentByPublicKey(publicKey: string): Promise<Agent | null> {
  if (!sql) {
    return Array.from(memAgents.values()).find(a => a.publicKey === publicKey) || null;
  }

  const rows = await sql<Agent[]>`
    SELECT 
      id, name, 
      public_key as "publicKey", 
      x_only_pubkey as "xOnlyPubkey",
      provider, 
      webhook_url as "webhookUrl", 
      metadata,
      created_at as "createdAt",
      updated_at as "updatedAt"
    FROM agents WHERE public_key = ${publicKey}
  `;
  return rows[0] || null;
}

export async function listAgents(): Promise<Agent[]> {
  if (!sql) {
    return Array.from(memAgents.values());
  }

  return sql<Agent[]>`
    SELECT 
      id, name, 
      public_key as "publicKey", 
      x_only_pubkey as "xOnlyPubkey",
      provider, 
      webhook_url as "webhookUrl", 
      metadata,
      created_at as "createdAt",
      updated_at as "updatedAt"
    FROM agents ORDER BY created_at DESC
  `;
}

// ═══════════════════════════════════════════════════════════════════
//                          MULTISIGS
// ═══════════════════════════════════════════════════════════════════

export async function createMultisig(
  multisig: Multisig, 
  agentPositions: Array<{ agentId: string; position: number }>
): Promise<Multisig> {
  if (!sql) {
    memMultisigs.set(multisig.id, multisig);
    return multisig;
  }

  await sql.begin(async tx => {
    await tx`
      INSERT INTO multisigs (
        id, name, chain_id, address, threshold, created_by,
        internal_pubkey, merkle_root, tweaked_pubkey, script_tree
      ) VALUES (
        ${multisig.id},
        ${multisig.name},
        ${multisig.chainId},
        ${multisig.address},
        ${multisig.threshold},
        ${multisig.createdBy},
        ${multisig.bitcoin?.internalPubkey || null},
        ${multisig.bitcoin?.merkleRoot || null},
        ${multisig.bitcoin?.tweakedPubkey || null},
        ${multisig.bitcoin?.scriptTree ? JSON.stringify(multisig.bitcoin.scriptTree) : null}
      )
    `;

    for (const { agentId, position } of agentPositions) {
      await tx`
        INSERT INTO multisig_agents (multisig_id, agent_id, position)
        VALUES (${multisig.id}, ${agentId}, ${position})
      `;
    }
  });

  return multisig;
}

export async function getMultisig(id: string): Promise<Multisig | null> {
  if (!sql) {
    return memMultisigs.get(id) || null;
  }

  const rows = await sql<any[]>`
    SELECT 
      m.id, m.name, 
      m.chain_id as "chainId", 
      m.address, 
      m.threshold,
      m.created_by as "createdBy",
      m.created_at as "createdAt",
      m.internal_pubkey as "internalPubkey",
      m.merkle_root as "merkleRoot",
      m.tweaked_pubkey as "tweakedPubkey",
      m.script_tree as "scriptTree",
      COALESCE(
        json_agg(
          json_build_object(
            'id', a.id,
            'name', a.name,
            'publicKey', a.public_key,
            'xOnlyPubkey', a.x_only_pubkey,
            'provider', a.provider,
            'position', ma.position
          ) ORDER BY ma.position
        ) FILTER (WHERE a.id IS NOT NULL),
        '[]'
      ) as agents
    FROM multisigs m
    LEFT JOIN multisig_agents ma ON m.id = ma.multisig_id
    LEFT JOIN agents a ON ma.agent_id = a.id
    WHERE m.id = ${id}
    GROUP BY m.id
  `;

  if (!rows[0]) return null;

  return {
    ...rows[0],
    agents: rows[0].agents || [],
  };
}

export async function listMultisigs(): Promise<Multisig[]> {
  if (!sql) {
    return Array.from(memMultisigs.values());
  }

  const rows = await sql<any[]>`
    SELECT 
      m.id, m.name, 
      m.chain_id as "chainId", 
      m.address, 
      m.threshold,
      m.created_by as "createdBy",
      m.created_at as "createdAt",
      m.internal_pubkey as "internalPubkey",
      m.merkle_root as "merkleRoot",
      m.tweaked_pubkey as "tweakedPubkey",
      m.script_tree as "scriptTree",
      COALESCE(
        json_agg(
          json_build_object(
            'id', a.id,
            'name', a.name,
            'publicKey', a.public_key,
            'xOnlyPubkey', a.x_only_pubkey,
            'provider', a.provider,
            'position', ma.position
          ) ORDER BY ma.position
        ) FILTER (WHERE a.id IS NOT NULL),
        '[]'
      ) as agents
    FROM multisigs m
    LEFT JOIN multisig_agents ma ON m.id = ma.multisig_id
    LEFT JOIN agents a ON ma.agent_id = a.id
    GROUP BY m.id
    ORDER BY m.created_at DESC
  `;

  return rows.map(r => ({
    ...r,
    agents: r.agents || [],
  }));
}

export async function getMultisigsForAgent(agentId: string): Promise<Multisig[]> {
  if (!sql) {
    return Array.from(memMultisigs.values()).filter(m =>
      m.agents.some((a: any) => a.id === agentId)
    );
  }

  const rows = await sql<any[]>`
    SELECT DISTINCT m.id
    FROM multisigs m
    JOIN multisig_agents ma ON m.id = ma.multisig_id
    WHERE ma.agent_id = ${agentId}
  `;

  const multisigs = await Promise.all(rows.map(r => getMultisig(r.id)));
  return multisigs.filter((m): m is Multisig => m !== null);
}

export async function getAgentsForMultisig(multisigId: string): Promise<Agent[]> {
  if (!sql) {
    const multisig = memMultisigs.get(multisigId);
    if (!multisig) return [];
    
    const agents: Agent[] = [];
    for (const a of multisig.agents) {
      const agent = memAgents.get(a.id);
      if (agent) agents.push(agent);
    }
    return agents;
  }

  const rows = await sql<any[]>`
    SELECT a.id, a.name, a.public_key, a.x_only_pubkey, a.provider, 
           a.webhook_url, a.metadata, a.created_at, a.updated_at
    FROM agents a
    JOIN multisig_agents ma ON a.id = ma.agent_id
    WHERE ma.multisig_id = ${multisigId}
    ORDER BY ma.position
  `;

  return rows.map(r => ({
    id: r.id,
    name: r.name,
    publicKey: r.public_key,
    xOnlyPubkey: r.x_only_pubkey,
    provider: r.provider,
    webhookUrl: r.webhook_url,
    metadata: r.metadata,
    createdAt: new Date(r.created_at),
    updatedAt: new Date(r.updated_at),
  }));
}

// ═══════════════════════════════════════════════════════════════════
//                          PROPOSALS
// ═══════════════════════════════════════════════════════════════════

export async function createProposal(proposal: Proposal): Promise<Proposal> {
  if (!sql) {
    memProposals.set(proposal.id, proposal);
    return proposal;
  }

  await sql`
    INSERT INTO proposals (
      id, multisig_id, status, outputs, fee_rate, fee,
      inputs, change_output, selected_leaf_index, required_signers,
      unsigned_tx, note, created_by, expires_at
    ) VALUES (
      ${proposal.id},
      ${proposal.multisigId},
      ${proposal.status},
      ${JSON.stringify(proposal.outputs)},
      ${proposal.feeRate || null},
      ${proposal.fee || null},
      ${proposal.inputs ? JSON.stringify(proposal.inputs) : null},
      ${proposal.changeOutput ? JSON.stringify(proposal.changeOutput) : null},
      ${proposal.selectedLeafIndex || null},
      ${proposal.requiredSigners},
      ${proposal.unsignedTx},
      ${proposal.note || null},
      ${proposal.createdBy},
      ${proposal.expiresAt}
    )
  `;
  return proposal;
}

export async function getProposal(id: string): Promise<Proposal | null> {
  if (!sql) {
    return memProposals.get(id) || null;
  }

  const rows = await sql<any[]>`
    SELECT 
      p.id, 
      p.multisig_id as "multisigId",
      p.status,
      p.outputs,
      p.fee_rate as "feeRate",
      p.fee,
      p.inputs,
      p.change_output as "changeOutput",
      p.selected_leaf_index as "selectedLeafIndex",
      p.required_signers as "requiredSigners",
      p.unsigned_tx as "unsignedTx",
      p.signed_tx as "signedTx",
      p.final_tx as "finalTx",
      p.txid,
      p.note,
      p.created_at as "createdAt",
      p.created_by as "createdBy",
      p.expires_at as "expiresAt",
      COALESCE(
        json_agg(
          json_build_object(
            'agentId', s.agent_id,
            'publicKey', s.public_key,
            'signature', s.signature,
            'signedAt', s.signed_at
          )
        ) FILTER (WHERE s.id IS NOT NULL),
        '[]'
      ) as signatures
    FROM proposals p
    LEFT JOIN signatures s ON p.id = s.proposal_id
    WHERE p.id = ${id}
    GROUP BY p.id
  `;

  if (!rows[0]) return null;

  return {
    ...rows[0],
    signatures: rows[0].signatures || [],
  };
}

export async function updateProposalStatus(
  id: string, 
  status: string,
  extra?: { signedTx?: string; finalTx?: string; txid?: string }
): Promise<void> {
  if (!sql) {
    const p = memProposals.get(id);
    if (p) {
      p.status = status as any;
      if (extra?.signedTx) p.signedTx = extra.signedTx;
      if (extra?.finalTx) p.finalTx = extra.finalTx;
      if (extra?.txid) p.txid = extra.txid;
    }
    return;
  }

  await sql`
    UPDATE proposals SET 
      status = ${status},
      signed_tx = COALESCE(${extra?.signedTx || null}, signed_tx),
      final_tx = COALESCE(${extra?.finalTx || null}, final_tx),
      txid = COALESCE(${extra?.txid || null}, txid)
    WHERE id = ${id}
  `;
}

export async function addSignature(
  proposalId: string,
  signature: SignatureEntry
): Promise<void> {
  if (!sql) {
    const p = memProposals.get(proposalId);
    if (p) {
      p.signatures.push(signature);
    }
    return;
  }

  await sql`
    INSERT INTO signatures (proposal_id, agent_id, public_key, signature)
    VALUES (${proposalId}, ${signature.agentId}, ${signature.publicKey}, ${signature.signature})
    ON CONFLICT (proposal_id, agent_id) DO UPDATE SET 
      signature = ${signature.signature},
      signed_at = NOW()
  `;
}

export async function getProposalsForMultisig(multisigId: string): Promise<Proposal[]> {
  if (!sql) {
    return Array.from(memProposals.values()).filter(p => p.multisigId === multisigId);
  }

  const rows = await sql<{ id: string }[]>`
    SELECT id FROM proposals WHERE multisig_id = ${multisigId}
  `;

  const proposals = await Promise.all(rows.map(r => getProposal(r.id)));
  return proposals.filter((p): p is Proposal => p !== null);
}

export async function getPendingProposalsForAgent(agentId: string): Promise<Proposal[]> {
  if (!sql) {
    return Array.from(memProposals.values()).filter(p => 
      p.status === 'pending' && 
      p.requiredSigners.includes(agentId) &&
      !p.signatures.find(s => s.agentId === agentId)
    );
  }

  const rows = await sql<{ id: string }[]>`
    SELECT p.id 
    FROM proposals p
    WHERE p.status = 'pending'
      AND ${agentId} = ANY(p.required_signers)
      AND NOT EXISTS (
        SELECT 1 FROM signatures s 
        WHERE s.proposal_id = p.id AND s.agent_id = ${agentId}
      )
  `;

  const proposals = await Promise.all(rows.map(r => getProposal(r.id)));
  return proposals.filter((p): p is Proposal => p !== null);
}

// ═══════════════════════════════════════════════════════════════════
//                          STATS
// ═══════════════════════════════════════════════════════════════════

export async function getStats() {
  if (!sql) {
    return {
      agents: memAgents.size,
      multisigs: memMultisigs.size,
      proposals: memProposals.size,
      proposalsByStatus: {
        pending: Array.from(memProposals.values()).filter(p => p.status === 'pending').length,
        ready: Array.from(memProposals.values()).filter(p => p.status === 'ready').length,
        finalized: Array.from(memProposals.values()).filter(p => p.status === 'finalized').length,
        broadcast: Array.from(memProposals.values()).filter(p => p.status === 'broadcast').length,
        confirmed: Array.from(memProposals.values()).filter(p => p.status === 'confirmed').length,
        rejected: Array.from(memProposals.values()).filter(p => p.status === 'rejected').length,
        expired: Array.from(memProposals.values()).filter(p => p.status === 'expired').length,
      },
      usingDatabase: false,
    };
  }

  const counts = await sql<any[]>`
    SELECT
      (SELECT COUNT(*) FROM agents) as agents,
      (SELECT COUNT(*) FROM multisigs) as multisigs,
      (SELECT COUNT(*) FROM proposals) as proposals,
      (SELECT COUNT(*) FROM proposals WHERE status = 'pending') as pending,
      (SELECT COUNT(*) FROM proposals WHERE status = 'ready') as ready,
      (SELECT COUNT(*) FROM proposals WHERE status = 'finalized') as finalized,
      (SELECT COUNT(*) FROM proposals WHERE status = 'broadcast') as broadcast,
      (SELECT COUNT(*) FROM proposals WHERE status = 'confirmed') as confirmed,
      (SELECT COUNT(*) FROM proposals WHERE status = 'rejected') as rejected,
      (SELECT COUNT(*) FROM proposals WHERE status = 'expired') as expired
  `;

  const c = counts[0];
  return {
    agents: Number(c.agents),
    multisigs: Number(c.multisigs),
    proposals: Number(c.proposals),
    proposalsByStatus: {
      pending: Number(c.pending),
      ready: Number(c.ready),
      finalized: Number(c.finalized),
      broadcast: Number(c.broadcast),
      confirmed: Number(c.confirmed),
      rejected: Number(c.rejected),
      expired: Number(c.expired),
    },
    usingDatabase: true,
  };
}

export default {
  createAgent,
  getAgent,
  getAgentByPublicKey,
  listAgents,
  createMultisig,
  getMultisig,
  listMultisigs,
  getMultisigsForAgent,
  getAgentsForMultisig,
  createProposal,
  getProposal,
  updateProposalStatus,
  addSignature,
  getProposalsForMultisig,
  getPendingProposalsForAgent,
  getStats,
};
