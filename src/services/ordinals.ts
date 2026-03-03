/**
 * Ordinals Service
 * 
 * Handles inscription lookups and ordinal-aware transaction construction.
 * Uses Hiro API (free, keyless) with option to add Unisat fallback.
 */

import { getConfirmedUtxos, getAllUtxos } from './bitcoin';

// ═══════════════════════════════════════════════════════════════════
//                          TYPES
// ═══════════════════════════════════════════════════════════════════

export interface InscriptionInfo {
  id: string;                    // e.g., "abc123i0"
  number: number;                // inscription number
  address: string;               // current owner
  location: string;              // satpoint: "txid:vout:offset"
  output: string;                // utxo: "txid:vout"
  value: number;                 // sats in the UTXO
  offset: number;                // sat offset within UTXO (usually 0)
  contentType: string;
  contentLength: number;
  genesisAddress: string;
  genesisTxId: string;
  satOrdinal: string;            // ordinal number of the sat
  satRarity: string;             // common, uncommon, rare, epic, legendary, mythic
  timestamp: number;
}

export interface OrdinalUtxo {
  txid: string;
  vout: number;
  value: number;
  inscriptionId: string;
  inscriptionOffset: number;
}

// ═══════════════════════════════════════════════════════════════════
//                       HIRO API CLIENT
// ═══════════════════════════════════════════════════════════════════

const HIRO_API = 'https://api.hiro.so/ordinals/v1';

/**
 * Get inscription details by ID
 */
export async function getInscription(inscriptionId: string): Promise<InscriptionInfo | null> {
  try {
    const res = await fetch(`${HIRO_API}/inscriptions/${inscriptionId}`);
    
    if (!res.ok) {
      if (res.status === 404) return null;
      throw new Error(`Hiro API error: ${res.status}`);
    }
    
    const data = await res.json();
    
    return {
      id: data.id,
      number: data.number,
      address: data.address,
      location: data.location,
      output: data.output,
      value: parseInt(data.value),
      offset: parseInt(data.offset),
      contentType: data.content_type,
      contentLength: data.content_length,
      genesisAddress: data.genesis_address,
      genesisTxId: data.genesis_tx_id,
      satOrdinal: data.sat_ordinal,
      satRarity: data.sat_rarity,
      timestamp: data.timestamp,
    };
  } catch (error) {
    console.error('Failed to fetch inscription:', error);
    throw error;
  }
}

/**
 * Get all inscriptions at an address
 */
export async function getInscriptionsByAddress(address: string): Promise<InscriptionInfo[]> {
  try {
    const res = await fetch(`${HIRO_API}/inscriptions?address=${address}&limit=60`);
    
    if (!res.ok) {
      throw new Error(`Hiro API error: ${res.status}`);
    }
    
    const data = await res.json();
    
    return data.results.map((item: any) => ({
      id: item.id,
      number: item.number,
      address: item.address,
      location: item.location,
      output: item.output,
      value: parseInt(item.value),
      offset: parseInt(item.offset),
      contentType: item.content_type,
      contentLength: item.content_length,
      genesisAddress: item.genesis_address,
      genesisTxId: item.genesis_tx_id,
      satOrdinal: item.sat_ordinal,
      satRarity: item.sat_rarity,
      timestamp: item.timestamp,
    }));
  } catch (error) {
    console.error('Failed to fetch inscriptions by address:', error);
    throw error;
  }
}

// ═══════════════════════════════════════════════════════════════════
//                    ORDINAL-SAFE TX CONSTRUCTION
// ═══════════════════════════════════════════════════════════════════

/**
 * Parse satpoint string into components
 * Format: "txid:vout:offset"
 */
export function parseSatpoint(satpoint: string): { txid: string; vout: number; offset: number } {
  const parts = satpoint.split(':');
  if (parts.length !== 3) {
    throw new Error(`Invalid satpoint format: ${satpoint}`);
  }
  return {
    txid: parts[0],
    vout: parseInt(parts[1]),
    offset: parseInt(parts[2]),
  };
}

/**
 * Verify an inscription is owned by an address
 */
export async function verifyOwnership(inscriptionId: string, address: string): Promise<boolean> {
  const inscription = await getInscription(inscriptionId);
  if (!inscription) return false;
  return inscription.address === address;
}

/**
 * Get the UTXO containing an inscription
 */
export async function getOrdinalUtxo(inscriptionId: string): Promise<OrdinalUtxo | null> {
  const inscription = await getInscription(inscriptionId);
  if (!inscription) return null;
  
  const [txid, voutStr] = inscription.output.split(':');
  
  return {
    txid,
    vout: parseInt(voutStr),
    value: inscription.value,
    inscriptionId: inscription.id,
    inscriptionOffset: inscription.offset,
  };
}

/**
 * Calculate output values for ordinal transfer
 * 
 * FIFO rule: sats flow from inputs to outputs in order.
 * To send ordinal: put ordinal UTXO first, recipient output first.
 * 
 * The inscription sits at `offset` within the UTXO.
 * Recipient output needs at least `offset + 1` sats to receive the inscription.
 * (Usually offset is 0, so 546 dust limit is enough)
 */
export function calculateOrdinalOutputs(
  ordinalUtxo: OrdinalUtxo,
  feeUtxos: { txid: string; vout: number; value: number }[],
  recipientAddress: string,
  feeRate: number
): {
  recipientValue: number;
  changeValue: number;
  totalInputValue: number;
  estimatedFee: number;
} {
  // Minimum output for ordinal (dust limit, or offset+1 if offset > 545)
  const minOrdinalOutput = Math.max(546, ordinalUtxo.inscriptionOffset + 1);
  
  // Sum all inputs
  const totalInputValue = ordinalUtxo.value + feeUtxos.reduce((sum, u) => sum + u.value, 0);
  
  // Estimate tx size: 1 ordinal input + N fee inputs, 2 outputs
  // P2TR input: ~57.5 vbytes, P2TR output: ~43 vbytes
  const numInputs = 1 + feeUtxos.length;
  const estimatedVbytes = 10.5 + (numInputs * 57.5) + (2 * 43); // header + inputs + outputs
  const estimatedFee = Math.ceil(estimatedVbytes * feeRate);
  
  // Recipient gets the ordinal with minimum sats
  const recipientValue = minOrdinalOutput;
  
  // Change gets the rest
  const changeValue = totalInputValue - recipientValue - estimatedFee;
  
  if (changeValue < 0) {
    throw new Error(`Insufficient funds. Need ${recipientValue + estimatedFee} sats, have ${totalInputValue}`);
  }
  
  // If change is dust, add it to recipient
  if (changeValue > 0 && changeValue < 546) {
    return {
      recipientValue: recipientValue + changeValue,
      changeValue: 0,
      totalInputValue,
      estimatedFee: estimatedFee + changeValue, // dust goes to fee
    };
  }
  
  return {
    recipientValue,
    changeValue,
    totalInputValue,
    estimatedFee,
  };
}

/**
 * Validate an ordinal send request
 */
export async function validateOrdinalSend(
  inscriptionId: string,
  multisigAddress: string,
  recipientAddress: string,
): Promise<{ valid: boolean; error?: string; inscription?: InscriptionInfo }> {
  // 1. Get inscription info
  const inscription = await getInscription(inscriptionId);
  if (!inscription) {
    return { valid: false, error: `Inscription not found: ${inscriptionId}` };
  }
  
  // 2. Verify ownership
  if (inscription.address !== multisigAddress) {
    return { 
      valid: false, 
      error: `Inscription not owned by multisig. Current owner: ${inscription.address}` 
    };
  }
  
  // 3. Validate recipient address format
  if (!recipientAddress.startsWith('bc1') && !recipientAddress.startsWith('tb1')) {
    return { valid: false, error: 'Recipient must be a bech32/bech32m address' };
  }
  
  // 4. Check for edge cases
  if (inscription.offset > 0) {
    console.warn(`Inscription has non-zero offset (${inscription.offset}). Handle with care.`);
  }
  
  return { valid: true, inscription };
}

export default {
  getInscription,
  getInscriptionsByAddress,
  parseSatpoint,
  verifyOwnership,
  getOrdinalUtxo,
  calculateOrdinalOutputs,
  validateOrdinalSend,
};
