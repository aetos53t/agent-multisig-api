/**
 * Database Connection
 * 
 * PostgreSQL connection using postgres.js
 */

import postgres from 'postgres';

// ═══════════════════════════════════════════════════════════════════
//                        CONNECTION
// ═══════════════════════════════════════════════════════════════════

const DATABASE_URL = process.env.DATABASE_URL;

console.log('🔍 DATABASE_URL check:', DATABASE_URL ? `set (${DATABASE_URL.substring(0, 20)}...)` : 'NOT SET');

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
