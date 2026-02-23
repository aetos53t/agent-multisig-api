/**
 * Database Connection
 * 
 * PostgreSQL connection using postgres.js with auto-migration
 */

import postgres from 'postgres';

// ═══════════════════════════════════════════════════════════════════
//                        CONNECTION
// ═══════════════════════════════════════════════════════════════════

const DATABASE_URL = process.env.DATABASE_URL;

console.log('🔍 DATABASE_URL check:', DATABASE_URL ? `set (${DATABASE_URL.substring(0, 30)}...)` : 'NOT SET');

if (!DATABASE_URL) {
  console.warn('⚠️ DATABASE_URL not set, using in-memory storage');
}

export const sql = DATABASE_URL 
  ? postgres(DATABASE_URL, {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
    })
  : null;

// ═══════════════════════════════════════════════════════════════════
//                      AUTO-MIGRATION
// ═══════════════════════════════════════════════════════════════════

let migrated = false;

export async function runMigrations(): Promise<boolean> {
  if (!sql || migrated) return migrated;
  
  try {
    // Check if base tables exist
    const tables = await sql`
      SELECT tablename FROM pg_tables 
      WHERE schemaname = 'public' AND tablename = 'agents'
    `;
    
    if (tables.length > 0) {
      console.log('✅ Base database tables already exist');
      
      // Check for invites table (added in v0.3.2)
      const invitesTable = await sql`
        SELECT tablename FROM pg_tables 
        WHERE schemaname = 'public' AND tablename = 'invites'
      `;
      
      if (invitesTable.length === 0) {
        console.log('🔨 Creating invites tables (v0.3.2 migration)...');
        
        // Create invites table
        await sql`
          CREATE TABLE IF NOT EXISTS invites (
            id VARCHAR(8) PRIMARY KEY,
            name VARCHAR(256) NOT NULL,
            chain_id chain_id NOT NULL,
            threshold INTEGER NOT NULL CHECK (threshold >= 2),
            total_slots INTEGER NOT NULL CHECK (total_slots >= 2),
            multisig_id UUID REFERENCES multisigs(id),
            address VARCHAR(256),
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days')
          )
        `;
        await sql`CREATE INDEX IF NOT EXISTS idx_invites_created ON invites(created_at)`;
        
        // Create invite_slots table
        await sql`
          CREATE TABLE IF NOT EXISTS invite_slots (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            invite_id VARCHAR(8) NOT NULL REFERENCES invites(id) ON DELETE CASCADE,
            slot_index INTEGER NOT NULL,
            name VARCHAR(256),
            public_key VARCHAR(130),
            session_id VARCHAR(64),
            joined_at TIMESTAMPTZ,
            UNIQUE (invite_id, slot_index)
          )
        `;
        await sql`CREATE INDEX IF NOT EXISTS idx_invite_slots_invite ON invite_slots(invite_id)`;
        
        console.log('✅ Invites tables created');
      }
      
      migrated = true;
      return true;
    }
    
    console.log('🔨 Creating database tables...');
    
    // Create extension
    await sql`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`;
    
    // Create enums (check if they exist first)
    await sql`
      DO $$ BEGIN
        CREATE TYPE chain_id AS ENUM (
          'bitcoin-mainnet', 'bitcoin-testnet', 'bitcoin-signet',
          'stacks-mainnet', 'stacks-testnet',
          'ethereum', 'base', 'arbitrum'
        );
      EXCEPTION WHEN duplicate_object THEN null; END $$
    `;
    
    await sql`
      DO $$ BEGIN
        CREATE TYPE wallet_provider AS ENUM (
          'aibtc', 'agentkit', 'crossmint', 'clawcash', 'custom'
        );
      EXCEPTION WHEN duplicate_object THEN null; END $$
    `;
    
    await sql`
      DO $$ BEGIN
        CREATE TYPE proposal_status AS ENUM (
          'pending', 'ready', 'finalized', 'broadcast', 'confirmed', 'rejected', 'expired'
        );
      EXCEPTION WHEN duplicate_object THEN null; END $$
    `;
    
    // Create agents table
    await sql`
      CREATE TABLE IF NOT EXISTS agents (
        id VARCHAR(64) PRIMARY KEY,
        name VARCHAR(256) NOT NULL,
        public_key VARCHAR(130) NOT NULL,
        x_only_pubkey VARCHAR(64),
        provider wallet_provider NOT NULL,
        webhook_url TEXT,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_agents_provider ON agents(provider)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_agents_public_key ON agents(public_key)`;
    
    // Create multisigs table
    await sql`
      CREATE TABLE IF NOT EXISTS multisigs (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name VARCHAR(256) NOT NULL,
        chain_id chain_id NOT NULL,
        address VARCHAR(256) NOT NULL,
        threshold INTEGER NOT NULL CHECK (threshold >= 2),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_by VARCHAR(64) NOT NULL REFERENCES agents(id),
        internal_pubkey VARCHAR(64),
        merkle_root VARCHAR(64),
        tweaked_pubkey VARCHAR(64),
        script_tree JSONB,
        stacks_principals TEXT[],
        evm_contract_address VARCHAR(42),
        evm_implementation_type VARCHAR(32)
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_multisigs_chain ON multisigs(chain_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_multisigs_address ON multisigs(address)`;
    
    // Create multisig_agents junction table
    await sql`
      CREATE TABLE IF NOT EXISTS multisig_agents (
        multisig_id UUID NOT NULL REFERENCES multisigs(id) ON DELETE CASCADE,
        agent_id VARCHAR(64) NOT NULL REFERENCES agents(id),
        position INTEGER NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (multisig_id, agent_id)
      )
    `;
    
    // Create proposals table
    await sql`
      CREATE TABLE IF NOT EXISTS proposals (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        multisig_id UUID NOT NULL REFERENCES multisigs(id),
        status proposal_status NOT NULL DEFAULT 'pending',
        outputs JSONB NOT NULL,
        fee_rate INTEGER,
        fee BIGINT,
        inputs JSONB,
        change_output JSONB,
        selected_leaf_index INTEGER,
        required_signers TEXT[] NOT NULL,
        unsigned_tx TEXT NOT NULL,
        signed_tx TEXT,
        final_tx TEXT,
        txid VARCHAR(64),
        note TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_by VARCHAR(64) NOT NULL REFERENCES agents(id),
        expires_at TIMESTAMPTZ NOT NULL
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_proposals_multisig ON proposals(multisig_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_proposals_status ON proposals(status)`;
    
    // Create signatures table
    await sql`
      CREATE TABLE IF NOT EXISTS signatures (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        proposal_id UUID NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
        agent_id VARCHAR(64) NOT NULL REFERENCES agents(id),
        public_key VARCHAR(130) NOT NULL,
        signature VARCHAR(256) NOT NULL,
        signed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (proposal_id, agent_id)
      )
    `;
    
    // Create webhooks table
    await sql`
      CREATE TABLE IF NOT EXISTS webhooks (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        agent_id VARCHAR(64) NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
        url TEXT NOT NULL,
        secret VARCHAR(256) NOT NULL,
        events TEXT[] NOT NULL,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    
    // Create audit_log table
    await sql`
      CREATE TABLE IF NOT EXISTS audit_log (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        event_type VARCHAR(64) NOT NULL,
        entity_type VARCHAR(32) NOT NULL,
        entity_id VARCHAR(64) NOT NULL,
        agent_id VARCHAR(64) REFERENCES agents(id),
        data JSONB,
        ip_address INET,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    
    // Create invites table
    await sql`
      CREATE TABLE IF NOT EXISTS invites (
        id VARCHAR(8) PRIMARY KEY,
        name VARCHAR(256) NOT NULL,
        chain_id chain_id NOT NULL,
        threshold INTEGER NOT NULL CHECK (threshold >= 2),
        total_slots INTEGER NOT NULL CHECK (total_slots >= 2),
        multisig_id UUID REFERENCES multisigs(id),
        address VARCHAR(256),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days')
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_invites_created ON invites(created_at)`;
    
    // Create invite_slots table
    await sql`
      CREATE TABLE IF NOT EXISTS invite_slots (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        invite_id VARCHAR(8) NOT NULL REFERENCES invites(id) ON DELETE CASCADE,
        slot_index INTEGER NOT NULL,
        name VARCHAR(256),
        public_key VARCHAR(130),
        session_id VARCHAR(64),
        joined_at TIMESTAMPTZ,
        UNIQUE (invite_id, slot_index)
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_invite_slots_invite ON invite_slots(invite_id)`;
    
    console.log('✅ Database tables created successfully');
    migrated = true;
    return true;
  } catch (e) {
    console.error('❌ Migration failed:', e);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════
//                        HEALTH CHECK
// ═══════════════════════════════════════════════════════════════════

export async function checkConnection(): Promise<boolean> {
  if (!sql) return false;
  try {
    await sql`SELECT 1`;
    return true;
  } catch (e) {
    console.error('Database connection failed:', e);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════
//                        GRACEFUL SHUTDOWN
// ═══════════════════════════════════════════════════════════════════

export async function closeConnection(): Promise<void> {
  if (sql) {
    await sql.end();
  }
}

export default sql;
// Database persistence enabled Thu Feb 19 15:45:01 EST 2026
