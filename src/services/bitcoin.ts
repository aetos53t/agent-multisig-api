/**
 * Bitcoin Network Service
 * 
 * Handles interaction with Bitcoin network via mempool.space API:
 * - Fetching UTXOs
 * - Getting fee estimates
 * - Broadcasting transactions
 * - Monitoring confirmations
 */

import type { ChainId, TxInput } from '../types';
import { CHAIN_CONFIGS } from '../types';

// ═══════════════════════════════════════════════════════════════════
//                          TYPES
// ═══════════════════════════════════════════════════════════════════

export interface MempoolUTXO {
  txid: string;
  vout: number;
  status: {
    confirmed: boolean;
    block_height?: number;
    block_hash?: string;
    block_time?: number;
  };
  value: number;
}

export interface MempoolFeeEstimates {
  fastestFee: number;
  halfHourFee: number;
  hourFee: number;
  economyFee: number;
  minimumFee: number;
}

export interface AddressInfo {
  address: string;
  chain_stats: {
    funded_txo_count: number;
    funded_txo_sum: number;
    spent_txo_count: number;
    spent_txo_sum: number;
    tx_count: number;
  };
  mempool_stats: {
    funded_txo_count: number;
    funded_txo_sum: number;
    spent_txo_count: number;
    spent_txo_sum: number;
    tx_count: number;
  };
}

export interface TransactionStatus {
  confirmed: boolean;
  block_height?: number;
  block_hash?: string;
  block_time?: number;
}

// ═══════════════════════════════════════════════════════════════════
//                       API CLIENT
// ═══════════════════════════════════════════════════════════════════

function getApiUrl(chainId: ChainId): string {
  const config = CHAIN_CONFIGS[chainId];
  if (!config?.mempoolApiUrl) {
    throw new Error(`No mempool API configured for chain: ${chainId}`);
  }
  return config.mempoolApiUrl;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json',
    },
  });
  
  if (!response.ok) {
    throw new Error(`API request failed: ${response.status} ${response.statusText}`);
  }
  
  return response.json();
}

async function postText(url: string, body: string): Promise<string> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain',
    },
    body,
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API request failed: ${response.status} - ${error}`);
  }
  
  return response.text();
}

// ═══════════════════════════════════════════════════════════════════
//                       UTXO OPERATIONS
// ═══════════════════════════════════════════════════════════════════

/**
 * Get UTXOs for an address
 */
export async function getUtxos(
  address: string,
  chainId: ChainId
): Promise<TxInput[]> {
  const apiUrl = getApiUrl(chainId);
  const utxos = await fetchJson<MempoolUTXO[]>(`${apiUrl}/address/${address}/utxo`);
  
  // Convert to our format
  return utxos.map(utxo => ({
    txid: utxo.txid,
    vout: utxo.vout,
    amount: BigInt(utxo.value),
    scriptPubkey: '', // Will be filled from address
  }));
}

/**
 * Get confirmed UTXOs only
 */
export async function getConfirmedUtxos(
  address: string,
  chainId: ChainId
): Promise<TxInput[]> {
  const apiUrl = getApiUrl(chainId);
  const utxos = await fetchJson<MempoolUTXO[]>(`${apiUrl}/address/${address}/utxo`);
  
  return utxos
    .filter(utxo => utxo.status.confirmed)
    .map(utxo => ({
      txid: utxo.txid,
      vout: utxo.vout,
      amount: BigInt(utxo.value),
      scriptPubkey: '',
    }));
}

/**
 * Get all UTXOs including unconfirmed (mempool)
 * Use with caution - unconfirmed UTXOs can be double-spent
 */
export async function getAllUtxos(
  address: string,
  chainId: ChainId
): Promise<TxInput[]> {
  const apiUrl = getApiUrl(chainId);
  const utxos = await fetchJson<MempoolUTXO[]>(`${apiUrl}/address/${address}/utxo`);
  
  return utxos.map(utxo => ({
    txid: utxo.txid,
    vout: utxo.vout,
    amount: BigInt(utxo.value),
    scriptPubkey: '',
    confirmed: utxo.status.confirmed,
  }));
}

/**
 * Get address balance
 */
export async function getBalance(
  address: string,
  chainId: ChainId
): Promise<{ confirmed: bigint; unconfirmed: bigint; total: bigint }> {
  const apiUrl = getApiUrl(chainId);
  const info = await fetchJson<AddressInfo>(`${apiUrl}/address/${address}`);
  
  const confirmed = BigInt(info.chain_stats.funded_txo_sum - info.chain_stats.spent_txo_sum);
  const unconfirmed = BigInt(info.mempool_stats.funded_txo_sum - info.mempool_stats.spent_txo_sum);
  
  return {
    confirmed,
    unconfirmed,
    total: confirmed + unconfirmed,
  };
}

// ═══════════════════════════════════════════════════════════════════
//                       FEE ESTIMATION
// ═══════════════════════════════════════════════════════════════════

/**
 * Get recommended fee rates
 */
export async function getFeeEstimates(
  chainId: ChainId
): Promise<MempoolFeeEstimates> {
  const apiUrl = getApiUrl(chainId);
  return fetchJson<MempoolFeeEstimates>(`${apiUrl}/v1/fees/recommended`);
}

/**
 * Get fee rate for a target confirmation time
 */
export async function getFeeRate(
  chainId: ChainId,
  target: 'fast' | 'medium' | 'slow' | 'economy' = 'medium'
): Promise<number> {
  const estimates = await getFeeEstimates(chainId);
  
  switch (target) {
    case 'fast':
      return estimates.fastestFee;
    case 'medium':
      return estimates.halfHourFee;
    case 'slow':
      return estimates.hourFee;
    case 'economy':
      return estimates.economyFee;
    default:
      return estimates.halfHourFee;
  }
}

// ═══════════════════════════════════════════════════════════════════
//                       TRANSACTION OPERATIONS
// ═══════════════════════════════════════════════════════════════════

/**
 * Broadcast a transaction
 */
export async function broadcastTransaction(
  txHex: string,
  chainId: ChainId
): Promise<string> {
  const apiUrl = getApiUrl(chainId);
  const txid = await postText(`${apiUrl}/tx`, txHex);
  return txid.trim();
}

/**
 * Get transaction status
 */
export async function getTransactionStatus(
  txid: string,
  chainId: ChainId
): Promise<TransactionStatus> {
  const apiUrl = getApiUrl(chainId);
  return fetchJson<TransactionStatus>(`${apiUrl}/tx/${txid}/status`);
}

/**
 * Get transaction details
 */
export async function getTransaction(
  txid: string,
  chainId: ChainId
): Promise<unknown> {
  const apiUrl = getApiUrl(chainId);
  return fetchJson(`${apiUrl}/tx/${txid}`);
}

/**
 * Wait for transaction confirmation
 */
export async function waitForConfirmation(
  txid: string,
  chainId: ChainId,
  options: {
    timeoutMs?: number;
    pollIntervalMs?: number;
  } = {}
): Promise<TransactionStatus> {
  const {
    timeoutMs = 60 * 60 * 1000, // 1 hour
    pollIntervalMs = 30 * 1000,  // 30 seconds
  } = options;
  
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeoutMs) {
    const status = await getTransactionStatus(txid, chainId);
    
    if (status.confirmed) {
      return status;
    }
    
    await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
  }
  
  throw new Error(`Transaction ${txid} not confirmed within timeout`);
}

// ═══════════════════════════════════════════════════════════════════
//                       SCRIPTPUBKEY
// ═══════════════════════════════════════════════════════════════════

/**
 * Get scriptPubKey for a P2TR address
 * 
 * P2TR scriptPubKey format: OP_1 <32-byte-tweaked-pubkey>
 * = 0x51 0x20 <32 bytes>
 */
export function p2trScriptPubkey(tweakedPubkey: string): string {
  if (tweakedPubkey.length !== 64) {
    throw new Error(`Invalid tweaked pubkey length: ${tweakedPubkey.length}`);
  }
  
  return '5120' + tweakedPubkey;
}

/**
 * Get scriptPubKey for address from mempool API
 */
export async function getScriptPubkey(
  address: string,
  chainId: ChainId
): Promise<string> {
  const apiUrl = getApiUrl(chainId);
  
  // Get any transaction involving this address to extract scriptPubKey
  // This is a workaround - ideally we'd derive it from the address
  const info = await fetchJson<AddressInfo>(`${apiUrl}/address/${address}`);
  
  if (info.chain_stats.funded_txo_count === 0) {
    throw new Error(`Address ${address} has no transaction history`);
  }
  
  // Get transactions to find scriptPubKey
  const txs = await fetchJson<any[]>(`${apiUrl}/address/${address}/txs`);
  
  for (const tx of txs) {
    for (const vout of tx.vout) {
      if (vout.scriptpubkey_address === address) {
        return vout.scriptpubkey;
      }
    }
  }
  
  throw new Error(`Could not find scriptPubKey for address ${address}`);
}

export default {
  getUtxos,
  getConfirmedUtxos,
  getAllUtxos,
  getBalance,
  getFeeEstimates,
  getFeeRate,
  broadcastTransaction,
  getTransactionStatus,
  getTransaction,
  waitForConfirmation,
  p2trScriptPubkey,
  getScriptPubkey,
};
