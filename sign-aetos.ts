import { mnemonicToSeedSync } from '@scure/bip39';
import { HDKey } from '@scure/bip32';
import { schnorr } from '@noble/secp256k1';

const mnemonic = "reflect please one paper slow excess retire advance just garment card vital mystery teach engine cable doll gate employ adjust decrease popular include another";

const seed = mnemonicToSeedSync(mnemonic);
const root = HDKey.fromMasterSeed(seed);
const child = root.derive("m/86'/0'/0'/0/0");

const sighash = "a804cc9c78241030384805b708b3b7c09dc31e245984c582756455633c439e03";
const sighashBytes = Buffer.from(sighash, 'hex');

const privateKey = child.privateKey!;
const signature = schnorr.sign(sighashBytes, privateKey);

console.log(Buffer.from(signature).toString('hex'));
