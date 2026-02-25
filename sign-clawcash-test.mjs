import { schnorr } from '@noble/curves/secp256k1';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';

// Aetos private key
const privateKey = hexToBytes('c69f241aeb387127c5a3cbfb966eea94280c14a7363b03f34a89295693ef8e60');
const sighash = '760237ef0a0c82661686cfe59edb154df7f4ad780f7c827ab3fb38d0fb30303e';

const signature = schnorr.sign(hexToBytes(sighash), privateKey);
console.log(bytesToHex(signature));
