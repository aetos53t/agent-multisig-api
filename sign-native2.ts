import * as btc from '@scure/btc-signer';
import { hex } from '@scure/base';
import { schnorr } from '@noble/curves/secp256k1';

const NETWORK = btc.NETWORK;

// Our keys
const aetosPriv = hex.decode('a2eed95b526d95036be599ba26658de2456dc1422524f9681f84fb8004076084');
const arcPriv = hex.decode('08f5f96da4d2c3a15d6e75b187873e2842c3d28e4bc2aa39f731b9512cf81946');

// UTXO
const utxo = {
  txid: '59e79c77dea5b679e38e36783c812dfffade098473687e4e7e6c988835334451',
  vout: 0,
  amount: 15000n,
};

// Build exactly as stored
const internalPubkey = hex.decode('50929b74c1a04954b78b4b6035e97a5e078a5a0f28ec96d547bfee9ace803ac0');
const script = hex.decode('2065ed13c9321e081a21c4494ffde06f5cc9311bd0efff1d83ca08e2e8c14022cfac209350761ae700acd872510de161bca0b90b78ddc007936674b318be8a50c531b5ba529c');

const TAPSCRIPT_LEAF_VERSION = 0xc0;
const taptree: btc.TaprootScriptTree = { script, leafVersion: TAPSCRIPT_LEAF_VERSION };
const p2tr = btc.p2tr(internalPubkey, taptree, NETWORK);

// Get outputs
const res = await fetch('https://quorumclaw.com/v1/proposals/dfae2e32-30c9-43dd-a56f-1e9b77320427');
const data = await res.json();

const tx = new btc.Transaction();
tx.addInput({
  txid: utxo.txid,
  index: utxo.vout,
  witnessUtxo: {
    script: p2tr.script,
    amount: utxo.amount,
  },
  tapInternalKey: p2tr.tapInternalKey,
  tapMerkleRoot: p2tr.tapMerkleRoot,
  tapLeafScript: p2tr.tapLeafScript,
});

for (const out of data.data.outputs) {
  tx.addOutputAddress(out.address, BigInt(out.amount), NETWORK);
}
if (data.data.changeOutput) {
  tx.addOutputAddress(data.data.changeOutput.address, BigInt(data.data.changeOutput.amount), NETWORK);
}

// Sign using the sign method with private keys
// btc-signer's sign expects a sign function
tx.sign(schnorr.sign, undefined, [arcPriv, aetosPriv]);

console.log('After sign, checking tapScriptSig:');
const input = tx.getInput(0);
console.log('tapScriptSig:', input.tapScriptSig?.length);

// Finalize
tx.finalize();
console.log('Finalized!');

const rawTx = tx.extract();
const txHex = hex.encode(rawTx);
console.log('TX:', txHex.slice(0, 80) + '...');

// Broadcast
const broadcastRes = await fetch('https://mempool.space/api/tx', {
  method: 'POST',
  headers: { 'Content-Type': 'text/plain' },
  body: txHex,
});
const result = await broadcastRes.text();
console.log('Result:', result);
