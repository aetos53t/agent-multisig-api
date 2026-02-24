import { schnorr } from '@noble/curves/secp256k1';

const sighash = 'eeefcd2aa235af7d8069bbc43d19923a06fe6a1f4418a4e0d9063d5fe604b01a';

const keys = {
  aetos: {
    privateKey: 'c69f241aeb387127c5a3cbfb966eea94280c14a7363b03f34a89295693ef8e60',
    agentId: 'invite-f8a0e41a-b7670ba2'
  },
  arc: {
    privateKey: 'b7c3d82076f178967d91dc2ab8dfd6639c8c649bb2cf7ef6c8d24d08e5c63cc5',
    agentId: 'invite-f8a0e41a-504ad77f'
  }
};

const proposalId = 'f529a92b-854f-4566-987c-44930ada6707';

async function signAndSubmit(name, key) {
  const sig = schnorr.sign(sighash, key.privateKey);
  const sigHex = Buffer.from(sig).toString('hex');
  console.log(`\n${name} signature: ${sigHex}`);
  
  const res = await fetch(`https://quorumclaw.com/v1/proposals/${proposalId}/sign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agentId: key.agentId, signature: sigHex })
  });
  const json = await res.json();
  console.log(`${name} sign result:`, JSON.stringify(json, null, 2));
  return json;
}

console.log('Signing sighash:', sighash);

const aetosResult = await signAndSubmit('Aetos', keys.aetos);
const arcResult = await signAndSubmit('Arc', keys.arc);

if (arcResult.data?.thresholdMet) {
  console.log('\n✓ THRESHOLD MET - checking for broadcast...');
  await new Promise(r => setTimeout(r, 2000)); // Wait for broadcast
  const propRes = await fetch(`https://quorumclaw.com/v1/proposals/${proposalId}`);
  const propData = await propRes.json();
  console.log('Final status:', propData.data?.status);
  console.log('TXID:', propData.data?.txid || 'pending...');
}
