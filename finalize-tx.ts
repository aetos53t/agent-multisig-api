import { hex } from '@scure/base';
import * as btc from '@scure/btc-signer';
import { sha256 } from '@noble/hashes/sha256';

// Signatures
const aetosSig = hex.decode("6cfa4a5a3af9741b34dbc7b917aba84b5b9fc9fa3182646eb1c12cf4a3dceb41812de439e1e0819295bf4709d1d341e826b164ef906f7e5443acf1f74c408e9c");
const arcSig = hex.decode("f1f2e9da7a77b17284396dc50a140b08cf0cdb005f4256dd3777c3ee76c5c35d52bcc09e7e276c52917a27be901af6e68d3df925d9093ace164d8204fdd28b71");
const aetosPubkey = hex.decode("2c0b0502dbbdfd05725416d45235c49f06387e1fa09cefe29f44da63cf78de73");
const arcPubkey = hex.decode("587de2def2ed807f147632b445d5f53af23d25294ab5359ef230c5e65bc06700");

// Script: <aetos> OP_CHECKSIG <arc> OP_CHECKSIGADD OP_2 OP_NUMEQUAL
const script = hex.decode("202c0b0502dbbdfd05725416d45235c49f06387e1fa09cefe29f44da63cf78de73ac20587de2def2ed807f147632b445d5f53af23d25294ab5359ef230c5e65bc06700ba529c");

// Internal pubkey (NUMS point - unspendable)
const internalPubkey = hex.decode("50929b74c1a04954b78b4b6035e97a5e078a5a0f28ec96d547bfee9ace803ac0");

// Build taptree
const taptree: btc.TaprootScriptTree = { script, leafVersion: 0xc0 };
const p2tr = btc.p2tr(internalPubkey, taptree, btc.NETWORK);

console.log("Address:", p2tr.address);

// Create transaction
const tx = new btc.Transaction();

// Add input
tx.addInput({
  txid: "7628bbd3ee6c5f8ef3ed3e961f5d41c86e297c21405317f46e6bfe78bfb3f15e",
  index: 0,
  witnessUtxo: {
    script: p2tr.script,
    amount: 15000n,
  },
  tapInternalKey: p2tr.tapInternalKey,
  tapMerkleRoot: p2tr.tapMerkleRoot,
  tapLeafScript: p2tr.tapLeafScript,
});

// Add outputs
tx.addOutputAddress("bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq", 10000n, btc.NETWORK);
tx.addOutputAddress("bc1ppxdargpzh6sf0pcd8makgva0hk9lsunkt6wfh445akpfn5hwvynqxsthz0", 4788n, btc.NETWORK);

// Compute leaf hash for tapScriptSig key
function taggedHash(tag: string, data: Uint8Array): Uint8Array {
  const tagHash = sha256(new TextEncoder().encode(tag));
  const combined = new Uint8Array(tagHash.length * 2 + data.length);
  combined.set(tagHash, 0);
  combined.set(tagHash, tagHash.length);
  combined.set(data, tagHash.length * 2);
  return sha256(combined);
}

const leafVersion = new Uint8Array([0xc0]);
const scriptLen = new Uint8Array([script.length]);
const leafData = new Uint8Array(1 + 1 + script.length);
leafData.set(leafVersion, 0);
leafData.set(scriptLen, 1);
leafData.set(script, 2);
const leafHash = taggedHash('TapLeaf', leafData);

console.log("Leaf hash:", hex.encode(leafHash));

// Add signatures using [key, value] format
// Key = {pubKey, leafHash}, Value = signature
tx.updateInput(0, {
  tapScriptSig: [
    [{ pubKey: aetosPubkey, leafHash: leafHash }, aetosSig],
    [{ pubKey: arcPubkey, leafHash: leafHash }, arcSig],
  ] as any,
});

console.log("Signatures added");

// Finalize
try {
  tx.finalize();
  const finalTx = tx.extract();
  const txHex = hex.encode(finalTx);
  
  // Compute txid
  const txHash = sha256(sha256(finalTx));
  const txid = hex.encode(txHash.reverse());
  
  console.log("\n✅ FINALIZED!");
  console.log("txid:", txid);
  console.log("vsize:", tx.vsize);
  console.log("\nRaw TX:");
  console.log(txHex);
} catch (e) {
  console.error("Finalization error:", e);
}
