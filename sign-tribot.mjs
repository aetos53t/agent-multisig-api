import { schnorr } from '@noble/curves/secp256k1';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';

// Aetos private key (from e2e-test-keys.json)
const privateKey = hexToBytes('c69f241aeb387127c5a3cbfb966eea94280c14a7363b03f34a89295693ef8e60');

console.log('Public key:', bytesToHex(schnorr.getPublicKey(privateKey)));

// Sighash to sign
const sighash = 'dbaf97d9dafa93327f9057fda23ea9e67f79a02e1020d535e177b4f5bfeb7b4d';
const sighashBytes = hexToBytes(sighash);

// Sign with Schnorr
const signature = schnorr.sign(sighashBytes, privateKey);
console.log('Signature:', bytesToHex(signature));
