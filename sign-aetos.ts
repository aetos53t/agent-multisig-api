import { HDKey } from '@scure/bip32';
import { mnemonicToSeedSync } from '@scure/bip39';
import { schnorr } from '@noble/curves/secp256k1';
import { hex } from '@scure/base';

const mnemonic = "reflect please one paper slow excess retire advance just garment card vital mystery teach engine cable doll gate employ adjust decrease popular include another";
const sighash = "b440b5a11d38ad00ce44872269b377ce7ad6b8e2fb8c3567eb4305aec720e501";

// Derive key (BIP86 path for taproot)
const seed = mnemonicToSeedSync(mnemonic);
const root = HDKey.fromMasterSeed(seed);
const key = root.derive("m/86'/0'/0'/0/0");

const privateKey = key.privateKey!;
const xOnlyPubkey = schnorr.getPublicKey(privateKey);

console.log("x-only pubkey:", hex.encode(xOnlyPubkey));

// Sign the sighash
const sighashBytes = hex.decode(sighash);
const signature = schnorr.sign(sighashBytes, privateKey);

console.log("signature:", hex.encode(signature));
