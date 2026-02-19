/**
 * API Integration Tests
 * 
 * Run with: bun test test/api.test.ts
 */

import { describe, test, expect, beforeAll } from 'bun:test';
import { hex } from '@scure/base';
import { secp256k1 } from '@noble/curves/secp256k1';
import app from '../src/index';

// Generate valid test pubkeys from known private keys
const TEST_PRIVKEYS = [
  '0000000000000000000000000000000000000000000000000000000000000001',
  '0000000000000000000000000000000000000000000000000000000000000002',
  '0000000000000000000000000000000000000000000000000000000000000003',
];

const TEST_PUBKEYS = TEST_PRIVKEYS.map(priv => {
  const point = secp256k1.ProjectivePoint.fromPrivateKey(hex.decode(priv));
  return point.toHex(true); // compressed with 02/03 prefix
});

// Helper to make requests
async function request(
  path: string,
  options?: RequestInit
): Promise<Response> {
  const url = `http://localhost/v1${path}`;
  return app.fetch(new Request(url, options));
}

async function json<T>(response: Response): Promise<T> {
  return response.json();
}

describe('Health', () => {
  test('GET /health returns ok or degraded', async () => {
    const res = await app.fetch(new Request('http://localhost/health'));
    const data = await json<any>(res);
    
    expect(res.status).toBe(200);
    // "degraded" is valid when running without DATABASE_URL (in-memory mode)
    expect(['healthy', 'ok', 'degraded']).toContain(data.status);
  });
});

describe('Multisigs API', () => {
  test('POST /v1/multisigs creates a 2-of-3 multisig', async () => {
    const res = await request('/multisigs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Test Multisig',
        chainId: 'bitcoin-testnet',
        threshold: 2,
        agents: [
          { id: 'agent-1', name: 'Agent One', publicKey: TEST_PUBKEYS[0], provider: 'custom' },
          { id: 'agent-2', name: 'Agent Two', publicKey: TEST_PUBKEYS[1], provider: 'custom' },
          { id: 'agent-3', name: 'Agent Three', publicKey: TEST_PUBKEYS[2], provider: 'custom' },
        ],
      }),
    });
    
    const data = await json<any>(res);
    
    expect(res.status).toBe(201);
    expect(data.success).toBe(true);
    expect(data.data.name).toBe('Test Multisig');
    expect(data.data.threshold).toBe(2);
    expect(data.data.agents.length).toBe(3);
    expect(data.data.address).toMatch(/^tb1p/); // testnet P2TR
    expect(data.data.bitcoin.internalPubkey).toBeDefined();
    expect(data.data.bitcoin.tweakedPubkey).toBeDefined();
    expect(data.data.bitcoin.scriptTree.leaves.length).toBe(3); // 3 choose 2
  });
  
  test('POST /v1/multisigs validates threshold', async () => {
    const res = await request('/multisigs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Bad Multisig',
        chainId: 'bitcoin-testnet',
        threshold: 5, // More than agents
        agents: [
          { id: 'agent-1', name: 'Agent One', publicKey: TEST_PUBKEYS[0], provider: 'custom' },
          { id: 'agent-2', name: 'Agent Two', publicKey: TEST_PUBKEYS[1], provider: 'custom' },
        ],
      }),
    });
    
    const data = await json<any>(res);
    
    expect(res.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error.code).toBe('VALIDATION_ERROR');
  });
  
  test('POST /v1/multisigs requires at least 2 agents', async () => {
    const res = await request('/multisigs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Single Agent',
        chainId: 'bitcoin-testnet',
        threshold: 1,
        agents: [
          { id: 'agent-1', name: 'Agent One', publicKey: TEST_PUBKEYS[0], provider: 'custom' },
        ],
      }),
    });
    
    const data = await json<any>(res);
    
    expect(res.status).toBe(400);
    expect(data.success).toBe(false);
  });
  
  test('GET /v1/multisigs/:id returns multisig', async () => {
    // First create one
    const createRes = await request('/multisigs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Fetch Test',
        chainId: 'bitcoin-testnet',
        threshold: 2,
        agents: [
          { id: 'fetch-1', name: 'Agent One', publicKey: TEST_PUBKEYS[0], provider: 'custom' },
          { id: 'fetch-2', name: 'Agent Two', publicKey: TEST_PUBKEYS[1], provider: 'custom' },
        ],
      }),
    });
    
    const created = await json<any>(createRes);
    const multisigId = created.data.id;
    
    // Now fetch it
    const getRes = await request(`/multisigs/${multisigId}`);
    const data = await json<any>(getRes);
    
    expect(getRes.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.id).toBe(multisigId);
    expect(data.data.name).toBe('Fetch Test');
  });
  
  test('GET /v1/multisigs/:id returns 404 for unknown', async () => {
    const res = await request('/multisigs/unknown-id');
    const data = await json<any>(res);
    
    expect(res.status).toBe(404);
    expect(data.success).toBe(false);
    expect(data.error.code).toBe('NOT_FOUND');
  });
  
  test('GET /v1/multisigs lists all multisigs', async () => {
    const res = await request('/multisigs');
    const data = await json<any>(res);
    
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(Array.isArray(data.data)).toBe(true);
  });
  
  test('mainnet uses bc1p prefix', async () => {
    const res = await request('/multisigs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Mainnet Test',
        chainId: 'bitcoin-mainnet',
        threshold: 2,
        agents: [
          { id: 'main-1', name: 'Agent One', publicKey: TEST_PUBKEYS[0], provider: 'custom' },
          { id: 'main-2', name: 'Agent Two', publicKey: TEST_PUBKEYS[1], provider: 'custom' },
        ],
      }),
    });
    
    const data = await json<any>(res);
    
    expect(res.status).toBe(201);
    expect(data.data.address).toMatch(/^bc1p/); // mainnet P2TR
  });
});

describe('Root', () => {
  test('GET / returns API info', async () => {
    const res = await app.fetch(new Request('http://localhost/'));
    const data = await json<any>(res);
    
    expect(res.status).toBe(200);
    expect(data.name).toBe('Agent Multisig Coordination API');
    expect(data.version).toBe('0.1.0');
  });
});
