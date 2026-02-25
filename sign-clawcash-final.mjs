import { schnorr } from '@noble/curves/secp256k1';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';

const privateKey = hexToBytes('5f8a9b82847eeee50f8268b99769445e59163efe953e8ea18c4a49507631af13');
const sighash = '760237ef0a0c82661686cfe59edb154df7f4ad780f7c827ab3fb38d0fb30303e';

console.log('Pubkey:', bytesToHex(schnorr.getPublicKey(privateKey)));
const signature = schnorr.sign(hexToBytes(sighash), privateKey);
console.log('Signature:', bytesToHex(signature));
