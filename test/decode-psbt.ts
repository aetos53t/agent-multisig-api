import * as btc from '@scure/btc-signer';
import { hex, base64 } from '@scure/base';

const psbt = "cHNidP8BAH0CAAAAAdAeOhFJ0v/ETbpfbVcOqO2dKUnqQoRia4563H3n7FQ1AAAAAAD/////AogTAAAAAAAAFgAUdVsTq1Wp1QBZ+Q04cENJoTNDcU4MEQAAAAAAACJRICBQbjKk3qyKVZjaQIm+763i/2TICbqcuFsN3s9PtQZhAAAAAAABASsQJwAAAAAAACJRICBQbjKk3qyKVZjaQIm+763i/2TICbqcuFsN3s9PtQZhIhXBUJKbdMGgSVS3i0tgNel6XgeKWg8o7JbVR7/ums6AOsBHIJsuw3HQ6pQvze9uhQoGKDeDkdjkvy5n4kRf4WoxRvVRrCDyjwK73uEqyLs7CbEsdmv+EHpKF69VSd2zYMB1eB6ixbpSnMABFyBQkpt0waBJVLeLS2A16XpeB4paDyjsltVHv+6azoA6wAEYIOfFl+PYFRyb8Z6qC6y9Un7OZ3aK+bCABDymXmzs1S+0AAAA";

const psbtBytes = base64.decode(psbt);
console.log("=== RAW PSBT (base64) ===");
console.log(psbt);
console.log("\n=== RAW PSBT (hex) ===");
console.log(hex.encode(psbtBytes));

const tx = btc.Transaction.fromPSBT(psbtBytes);
console.log("\n=== DECODED PSBT ===");

console.log("\nInputs:", tx.inputsLength);
for (let i = 0; i < tx.inputsLength; i++) {
  const inp = tx.getInput(i);
  console.log(`\nInput ${i}:`);
  console.log("  txid:", inp.txid ? hex.encode(new Uint8Array(inp.txid)) : "N/A");
  console.log("  index:", inp.index);
  console.log("  witnessUtxo:", inp.witnessUtxo ? {
    script: hex.encode(inp.witnessUtxo.script),
    amount: inp.witnessUtxo.amount.toString()
  } : "N/A");
  console.log("  tapInternalKey:", inp.tapInternalKey ? hex.encode(inp.tapInternalKey) : "N/A");
  console.log("  tapMerkleRoot:", inp.tapMerkleRoot ? hex.encode(inp.tapMerkleRoot) : "N/A");
  
  if (inp.tapLeafScript) {
    console.log("  tapLeafScript entries:", inp.tapLeafScript.length);
    for (const leaf of inp.tapLeafScript) {
      const scriptHex = leaf.script instanceof Uint8Array ? hex.encode(leaf.script) : String(leaf.script);
      const cbHex = leaf.controlBlock instanceof Uint8Array ? hex.encode(leaf.controlBlock) : String(leaf.controlBlock);
      console.log("    - script:", scriptHex);
      console.log("      leafVersion:", leaf.leafVersion);
      console.log("      controlBlock:", cbHex);
    }
  }
}

console.log("\nOutputs:", tx.outputsLength);
for (let i = 0; i < tx.outputsLength; i++) {
  const out = tx.getOutput(i);
  console.log(`  ${i}:`, out.amount?.toString(), "sats to", out.script ? hex.encode(out.script) : "?");
}
