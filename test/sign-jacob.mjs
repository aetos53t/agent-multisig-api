import { schnorr } from '@noble/curves/secp256k1';

const sighash = 'c74441c0373561b42962e7d6a51121d04b09bec09c9fa66ea2d55f80dd121c2b';
const privateKey = 'c69f241aeb387127c5a3cbfb966eea94280c14a7363b03f34a89295693ef8e60';
const agentId = 'invite-13bd388c-b7670ba2';
const proposalId = '7149ae08-eb67-43b1-9509-9019acc285a5';

// Sign
const sig = schnorr.sign(sighash, privateKey);
const sigHex = Buffer.from(sig).toString('hex');
console.log('Aetos signature:', sigHex);

// Submit
const res = await fetch(`https://quorumclaw.com/v1/proposals/${proposalId}/sign`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ agentId, signature: sigHex })
});
const json = await res.json();
console.log('Result:', JSON.stringify(json, null, 2));

if (json.data?.thresholdMet) {
  console.log('\n🎉 THRESHOLD MET!');
}
