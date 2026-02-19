import { schnorr } from '@noble/curves/secp256k1';
import { bytesToHex } from '@noble/hashes/utils';

// Keys from demo-multisig-keys.json
const BETA_PRIVKEY = '08f5f96da4d2c3a15d6e75b187873e2842c3d28e4bc2aa39f731b9512cf81946';
const ALPHA_PRIVKEY = 'a2eed95b526d95036be599ba26658de2456dc1422524f9681f84fb8004076084';

// Sighash from the API
const SIGHASH = '0f2dad42f60700433c094208298607bd4599239e8d6e3fcdd4185d61e0d13ffa';

console.log('=== Signing for Proposal ===');
console.log('Sighash:', SIGHASH);

// Sign with BETA
const betaSig = schnorr.sign(SIGHASH, BETA_PRIVKEY);
console.log('\nBETA signature:', bytesToHex(betaSig));

// Verify BETA signature
const BETA_PUBKEY = '65ed13c9321e081a21c4494ffde06f5cc9311bd0efff1d83ca08e2e8c14022cf';
const betaValid = schnorr.verify(betaSig, SIGHASH, BETA_PUBKEY);
console.log('BETA sig valid:', betaValid);

// Sign with ALPHA
const alphaSig = schnorr.sign(SIGHASH, ALPHA_PRIVKEY);
console.log('\nALPHA signature:', bytesToHex(alphaSig));

// Verify ALPHA signature
const ALPHA_PUBKEY = '9350761ae700acd872510de161bca0b90b78ddc007936674b318be8a50c531b5';
const alphaValid = schnorr.verify(alphaSig, SIGHASH, ALPHA_PUBKEY);
console.log('ALPHA sig valid:', alphaValid);

// Output for API calls
console.log('\n=== For API submission ===');
console.log('BETA_SIG=' + bytesToHex(betaSig));
console.log('ALPHA_SIG=' + bytesToHex(alphaSig));
