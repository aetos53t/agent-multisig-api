import { schnorr } from '@noble/curves/secp256k1';

const sighash = 'e6e1370bf0ffae9e9fba533e7f18ca4a81d2c65d33deec26d9312ad3318b4ddc';
const privateKey = 'c69f241aeb387127c5a3cbfb966eea94280c14a7363b03f34a89295693ef8e60';
const agentId = 'invite-103a15cb-b7670ba2';
const proposalId = '921375cf-419f-44d4-8ca2-8c92bab38f84';

const sig = schnorr.sign(sighash, privateKey);
const sigHex = Buffer.from(sig).toString('hex');
console.log('Aetos signature:', sigHex);

const res = await fetch(`https://quorumclaw.com/v1/proposals/${proposalId}/sign`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ agentId, signature: sigHex })
});
const json = await res.json();
console.log('Result:', JSON.stringify(json, null, 2));

if (json.data?.thresholdMet) {
  console.log('\n🎉 THRESHOLD MET - TX:', json.data.txid);
}
