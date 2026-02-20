import Safe from '@safe-global/protocol-kit';
import { createPublicClient, http, formatEther, parseEther } from 'viem';
import { base } from 'viem/chains';
import { OperationType } from '@safe-global/types-kit';

const keysData = await Bun.file('/Users/aetos/.openclaw/workspace/credentials/demo-safe-keys.json').json();

const DEPLOYED_SAFE = '0x51702bfc9a359d81acbb77732d69828ee14df9c6';
// Use a different RPC to avoid rate limits
const RPC_URL = 'https://base-mainnet.public.blastapi.io';

console.log('=== Safe Transaction Execution ===\n');
console.log('Safe:', DEPLOYED_SAFE);

const publicClient = createPublicClient({ chain: base, transport: http(RPC_URL) });

const balance = await publicClient.getBalance({ address: DEPLOYED_SAFE as `0x${string}` });
console.log('Balance:', formatEther(balance), 'ETH');

const signer1Key = keysData.keys.find((k: any) => k.address.toLowerCase() === keysData.sortedOwners[0].toLowerCase());
const signer2Key = keysData.keys.find((k: any) => k.address.toLowerCase() === keysData.sortedOwners[1].toLowerCase());

console.log('\nSigner 1:', signer1Key.name);
console.log('Signer 2:', signer2Key.name);

console.log('\n=== Connecting to Safe ===');

let protocolKit = await Safe.init({
  provider: RPC_URL,
  signer: signer1Key.privateKey,
  safeAddress: DEPLOYED_SAFE,
});

console.log('Connected ✓');

// Create transaction - send 0.001 ETH to signer1
console.log('\n=== Creating Transaction ===');
const destination = signer1Key.address;
const amount = parseEther('0.001');

console.log('To:', destination);
console.log('Amount:', formatEther(amount), 'ETH');

const safeTx = await protocolKit.createTransaction({
  transactions: [{
    to: destination,
    value: amount.toString(),
    data: '0x',
    operation: OperationType.Call,
  }],
});

console.log('\n=== Signing (2-of-3) ===');

let signedTx = await protocolKit.signTransaction(safeTx);
console.log('Signer 1 ✓');

protocolKit = await protocolKit.connect({ signer: signer2Key.privateKey });
signedTx = await protocolKit.signTransaction(signedTx);
console.log('Signer 2 ✓');

console.log('Signatures:', signedTx.signatures.size);

console.log('\n=== Executing ===');

const txResponse = await protocolKit.executeTransaction(signedTx);
console.log('\n🎉 Submitted! Hash:', txResponse.hash);

console.log('\nWaiting for confirmation...');
const receipt = await publicClient.waitForTransactionReceipt({ 
  hash: txResponse.hash as `0x${string}`,
  timeout: 120000,
});

console.log('\n✅ CONFIRMED! Block:', receipt.blockNumber);
console.log('\n🔗 https://basescan.org/tx/' + txResponse.hash);
