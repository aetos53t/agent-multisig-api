import * as btc from '@scure/btc-signer';
import { hex, base64 } from '@scure/base';

// Signed PSBT (has 1 signature already)
const signedPsbt = "cHNidP8BAH0CAAAAAdAeOhFJ0v/ETbpfbVcOqO2dKUnqQoRia4563H3n7FQ1AAAAAAD/////AogTAAAAAAAAFgAUdVsTq1Wp1QBZ+Q04cENJoTNDcU4MEQAAAAAAACJRICBQbjKk3qyKVZjaQIm+763i/2TICbqcuFsN3s9PtQZhAAAAAAABASsQJwAAAAAAACJRICBQbjKk3qyKVZjaQIm+763i/2TICbqcuFsN3s9PtQZhQRSbLsNx0OqUL83vboUKBig3g5HY5L8uZ+JEX+FqMUb1UefFl+PYFRyb8Z6qC6y9Un7OZ3aK+bCABDymXmzs1S+0QBiKGyGq34eGAAjllYsu4Q/+bKX3BZkrOeCeuG9A3mZ6e266XjieDZA8Y/deuH/rrMNTEO+DblsQW8j8jq7FbVwiFcFQkpt0waBJVLeLS2A16XpeB4paDyjsltVHv+6azoA6wEcgmy7DcdDqlC/N726FCgYoN4OR2OS/LmfiRF/hajFG9VGsIPKPArve4SrIuzsJsSx2a/4QekoXr1VJ3bNgwHV4HqLFulKcwAEXIFCSm3TBoElUt4tLYDXpel4HiloPKOyW1Ue/7prOgDrAARgg58WX49gVHJvxnqoLrL1Sfs5ndor5sIAEPKZebOzVL7QAAAA=";

console.log("=== SIGNED PSBT (hex) ===");
const psbtBytes = base64.decode(signedPsbt);
console.log(hex.encode(psbtBytes));

const tx = btc.Transaction.fromPSBT(psbtBytes);
const inp = tx.getInput(0);

console.log("\n=== TAPROOT INPUT FIELDS ===");
console.log("tapInternalKey (32 bytes x-only):", inp.tapInternalKey ? hex.encode(inp.tapInternalKey) : "N/A");
console.log("tapMerkleRoot:", inp.tapMerkleRoot ? hex.encode(inp.tapMerkleRoot) : "N/A");

// Check raw PSBT keys
console.log("\n=== RAW PSBT BIP-371 FIELDS ===");
console.log("Looking for:");
console.log("  PSBT_IN_TAP_KEY_SIG (0x14)");
console.log("  PSBT_IN_TAP_SCRIPT_SIG (0x15)");
console.log("  PSBT_IN_TAP_LEAF_SCRIPT (0x16)");
console.log("  PSBT_IN_TAP_BIP32_DERIVATION (0x17)");
console.log("  PSBT_IN_TAP_INTERNAL_KEY (0x18)");
console.log("  PSBT_IN_TAP_MERKLE_ROOT (0x19)");

// Raw script from the PSBT (parsed from hex)
// 47 = script length
// 20 9b2ec371... = OP_PUSHBYTES_32 <pubkey1>
// ac = OP_CHECKSIG
// 20 f28f02bb... = OP_PUSHBYTES_32 <pubkey2>
// ac = OP_CHECKSIG
// ba = OP_2
// 52 = OP_CHECKSIGADD (wrong - should be different)
const scriptInPsbt = "209b2ec371d0ea942fcdef6e850a0628378391d8e4bf2e67e2445fe16a3146f551ac20f28f02bbdee12ac8bb3b09b12c766bfe107a4a17af5549ddb360c075781ea2c5ba529cc0";

console.log("\n=== TAPSCRIPT DECODING ===");
console.log("Raw script hex:", scriptInPsbt);
console.log("\nBreaking down:");

// Parse manually
let offset = 0;
const bytes = hex.decode(scriptInPsbt);
while (offset < bytes.length) {
  const op = bytes[offset];
  if (op === 0x20) {
    // OP_PUSHBYTES_32
    const pubkey = hex.encode(bytes.slice(offset+1, offset+33));
    console.log(`  [${offset}] OP_PUSHBYTES_32 ${pubkey}`);
    console.log(`       -> This pubkey is ${pubkey.length/2} bytes = x-only format ✓`);
    offset += 33;
  } else if (op === 0xac) {
    console.log(`  [${offset}] OP_CHECKSIG (0xac)`);
    offset += 1;
  } else if (op === 0xba) {
    console.log(`  [${offset}] OP_CHECKSIGADD (0xba)`);
    offset += 1;
  } else if (op === 0x52) {
    console.log(`  [${offset}] OP_2 (0x52)`);
    offset += 1;
  } else if (op === 0x9c) {
    console.log(`  [${offset}] OP_NUMEQUAL (0x9c)`);
    offset += 1;
  } else {
    console.log(`  [${offset}] Unknown opcode: 0x${op.toString(16)}`);
    offset += 1;
  }
}
