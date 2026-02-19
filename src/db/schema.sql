-- Agent Multisig Coordination API - Database Schema
-- PostgreSQL

-- ═══════════════════════════════════════════════════════════════════
--                            EXTENSIONS
-- ═══════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ═══════════════════════════════════════════════════════════════════
--                              ENUMS
-- ═══════════════════════════════════════════════════════════════════

CREATE TYPE chain_id AS ENUM (
  'bitcoin-mainnet',
  'bitcoin-testnet',
  'bitcoin-signet',
  'stacks-mainnet',
  'stacks-testnet',
  'ethereum',
  'base',
  'arbitrum'
);

CREATE TYPE wallet_provider AS ENUM (
  'aibtc',
  'agentkit',
  'crossmint',
  'clawcash',
  'custom'
);

CREATE TYPE proposal_status AS ENUM (
  'pending',
  'ready',
  'finalized',
  'broadcast',
  'confirmed',
  'rejected',
  'expired'
);

-- ═══════════════════════════════════════════════════════════════════
--                             AGENTS
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE agents (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(256) NOT NULL,
  public_key VARCHAR(130) NOT NULL,        -- Hex, up to 65 bytes
  x_only_pubkey VARCHAR(64),               -- 32 bytes for Taproot
  provider wallet_provider NOT NULL,
  webhook_url TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_agents_provider ON agents(provider);
CREATE INDEX idx_agents_public_key ON agents(public_key);

-- ═══════════════════════════════════════════════════════════════════
--                            MULTISIGS
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE multisigs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(256) NOT NULL,
  chain_id chain_id NOT NULL,
  address VARCHAR(256) NOT NULL,
  threshold INTEGER NOT NULL CHECK (threshold >= 2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by VARCHAR(64) NOT NULL REFERENCES agents(id),
  
  -- Bitcoin-specific (P2TR)
  internal_pubkey VARCHAR(64),
  merkle_root VARCHAR(64),
  tweaked_pubkey VARCHAR(64),
  script_tree JSONB,                       -- TapTree structure
  
  -- Stacks-specific
  stacks_principals TEXT[],
  
  -- EVM-specific
  evm_contract_address VARCHAR(42),
  evm_implementation_type VARCHAR(32)
);

CREATE INDEX idx_multisigs_chain ON multisigs(chain_id);
CREATE INDEX idx_multisigs_address ON multisigs(address);
CREATE INDEX idx_multisigs_created_by ON multisigs(created_by);

-- ═══════════════════════════════════════════════════════════════════
--                       MULTISIG <-> AGENT
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE multisig_agents (
  multisig_id UUID NOT NULL REFERENCES multisigs(id) ON DELETE CASCADE,
  agent_id VARCHAR(64) NOT NULL REFERENCES agents(id),
  position INTEGER NOT NULL,               -- Order in script
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (multisig_id, agent_id)
);

CREATE INDEX idx_multisig_agents_agent ON multisig_agents(agent_id);

-- ═══════════════════════════════════════════════════════════════════
--                            PROPOSALS
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE proposals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  multisig_id UUID NOT NULL REFERENCES multisigs(id),
  status proposal_status NOT NULL DEFAULT 'pending',
  
  -- Outputs
  outputs JSONB NOT NULL,                  -- Array of {address, amount, label?}
  fee_rate INTEGER,                        -- sat/vB
  fee BIGINT,                              -- Calculated fee
  
  -- UTXO-specific
  inputs JSONB,                            -- Array of {txid, vout, amount, scriptPubkey}
  change_output JSONB,                     -- {address, amount}
  
  -- Signing coordination
  selected_leaf_index INTEGER,
  required_signers TEXT[] NOT NULL,        -- Agent IDs
  
  -- Transaction data
  unsigned_tx TEXT NOT NULL,               -- PSBT or unsigned tx
  signed_tx TEXT,
  final_tx TEXT,
  txid VARCHAR(64),
  
  -- Metadata
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by VARCHAR(64) NOT NULL REFERENCES agents(id),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_proposals_multisig ON proposals(multisig_id);
CREATE INDEX idx_proposals_status ON proposals(status);
CREATE INDEX idx_proposals_created_by ON proposals(created_by);
CREATE INDEX idx_proposals_expires ON proposals(expires_at);

-- ═══════════════════════════════════════════════════════════════════
--                           SIGNATURES
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE signatures (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  proposal_id UUID NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  agent_id VARCHAR(64) NOT NULL REFERENCES agents(id),
  public_key VARCHAR(130) NOT NULL,
  signature VARCHAR(256) NOT NULL,         -- Hex-encoded
  signed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (proposal_id, agent_id)
);

CREATE INDEX idx_signatures_proposal ON signatures(proposal_id);
CREATE INDEX idx_signatures_agent ON signatures(agent_id);

-- ═══════════════════════════════════════════════════════════════════
--                            WEBHOOKS
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE webhooks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id VARCHAR(64) NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  secret VARCHAR(256) NOT NULL,
  events TEXT[] NOT NULL,                  -- Array of event types
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_webhooks_agent ON webhooks(agent_id);
CREATE INDEX idx_webhooks_active ON webhooks(active) WHERE active = TRUE;

-- ═══════════════════════════════════════════════════════════════════
--                          AUDIT LOG
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_type VARCHAR(64) NOT NULL,
  entity_type VARCHAR(32) NOT NULL,        -- 'multisig', 'proposal', etc.
  entity_id VARCHAR(64) NOT NULL,
  agent_id VARCHAR(64) REFERENCES agents(id),
  data JSONB,
  ip_address INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_log_entity ON audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_log_agent ON audit_log(agent_id);
CREATE INDEX idx_audit_log_created ON audit_log(created_at);

-- ═══════════════════════════════════════════════════════════════════
--                         UPDATE TRIGGERS
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER agents_updated_at
  BEFORE UPDATE ON agents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER webhooks_updated_at
  BEFORE UPDATE ON webhooks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ═══════════════════════════════════════════════════════════════════
--                            VIEWS
-- ═══════════════════════════════════════════════════════════════════

-- Proposals with signature counts
CREATE VIEW proposals_with_status AS
SELECT 
  p.*,
  m.name as multisig_name,
  m.threshold,
  (SELECT COUNT(*) FROM signatures s WHERE s.proposal_id = p.id) as signature_count,
  (SELECT COUNT(*) FROM signatures s WHERE s.proposal_id = p.id) >= m.threshold as threshold_met,
  ARRAY(
    SELECT s.agent_id FROM signatures s WHERE s.proposal_id = p.id ORDER BY s.signed_at
  ) as signed_by,
  ARRAY(
    SELECT unnest(p.required_signers) EXCEPT SELECT s.agent_id FROM signatures s WHERE s.proposal_id = p.id
  ) as remaining_signers
FROM proposals p
JOIN multisigs m ON p.multisig_id = m.id;

-- Agent multisig memberships
CREATE VIEW agent_multisigs AS
SELECT 
  a.id as agent_id,
  a.name as agent_name,
  m.id as multisig_id,
  m.name as multisig_name,
  m.chain_id,
  m.address,
  m.threshold,
  ma.position
FROM agents a
JOIN multisig_agents ma ON a.id = ma.agent_id
JOIN multisigs m ON ma.multisig_id = m.id;
