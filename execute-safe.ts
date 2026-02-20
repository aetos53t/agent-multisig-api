import Safe from '@safe-global/protocol-kit';
import { createPublicClient, http, formatEther, parseAbi, encodeFunctionData } from 'viem';
import { base } from 'viem/chains';
import { MetaTransactionData, OperationType } from '@safe-global/types-kit';

const keysData = await Bun.file('/Users/aetos/.openclaw/workspace/credentials/demo-safe-keys.json').json();

console.log('=== Safe Deployment & Execution (Corrected) ===\n');
console.log('Target Safe:', keysData.safeAddress);

const RPC_URL = 'https://mainnet.base.org';
const publicClient = createPublicClient({ chain: base, transport: http(RPC_URL) });

// Check balances
const ethBalance = await publicClient.getBalance({ address: keysData.safeAddress as `0x${string}` });
const USDC_ADDRESS = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913' as const;
const usdcBalance = await publicClient.readContract({
  address: USDC_ADDRESS,
  abi: parseAbi(['function balanceOf(address) view returns (uint256)']),
  functionName: 'balanceOf',
  args: [keysData.safeAddress as `0x${string}`],
});

console.log('ETH Balance:', formatEther(ethBalance), 'ETH');
console.log('USDC Balance:', Number(usdcBalance) / 1e6, 'USDC');

// Get signers
const signer1Key = keysData.keys.find((k: any) => k.address.toLowerCase() === keysData.sortedOwners[0].toLowerCase());
const signer2Key = keysData.keys.find((k: any) => k.address.toLowerCase() === keysData.sortedOwners[1].toLowerCase());

console.log('\nSigner 1:', signer1Key.name);
console.log('Signer 2:', signer2Key.name);

// Initialize with EXACT parameters that match our prediction
console.log('\n=== Initializing Safe with Correct Parameters ===');

let protocolKit = await Safe.init({
  provider: RPC_URL,
  signer: signer1Key.privateKey,
  predictedSafe: {
    safeAccountConfig: {
      owners: keysData.sortedOwners,
      threshold: keysData.threshold,
    },
    safeDeploymentConfig: {
      saltNonce: '0',
      safeVersion: '1.3.0',
    },
  },
});

const predictedAddress = await protocolKit.getAddress();
console.log('SDK Predicted:', predictedAddress);
console.log('Target:', keysData.safeAddress);
console.log('Match:', predictedAddress.toLowerCase() === keysData.safeAddress.toLowerCase() ? '✅ YES' : '❌ NO');

const isDeployed = await protocolKit.isSafeDeployed();
console.log('Is deployed:', isDeployed);

// Create USDC transfer transaction
console.log('\n=== Creating USDC Transfer ===');

// Send to first owner (BETA)
const destination = signer1Key.address;
const amount = usdcBalance;

console.log('To:', destination);
console.log('Amount:', Number(amount) / 1e6, 'USDC');

// Encode transfer
const transferData = encodeFunctionData({
  abi: parseAbi(['function transfer(address to, uint256 amount) returns (bool)']),
  functionName: 'transfer',
  args: [destination as `0x${string}`, amount],
});

const safeTransaction: MetaTransactionData = {
  to: USDC_ADDRESS,
  value: '0',
  data: transferData,
  operation: OperationType.Call,
};

const safeTx = await protocolKit.createTransaction({
  transactions: [safeTransaction],
});

console.log('\n=== Signing ===');

// Sign with both signers
let signedTx = await protocolKit.signTransaction(safeTx);
console.log('Signer 1 signed ✓');

protocolKit = await protocolKit.connect({ signer: signer2Key.privateKey });
signedTx = await protocolKit.signTransaction(signedTx);
console.log('Signer 2 signed ✓');

console.log('Signatures:', signedTx.signatures.size);

// Execute
console.log('\n=== Executing (Deploy + Transfer) ===');

try {
  const txResponse = await protocolKit.executeTransaction(signedTx);
  console.log('\n🎉 Transaction submitted!');
  console.log('Hash:', txResponse.hash);
  
  console.log('\nWaiting for confirmation...');
  const receipt = await publicClient.waitForTransactionReceipt({ 
    hash: txResponse.hash as `0x${string}`,
    timeout: 120000,
  });
  
  console.log('\n✅ CONFIRMED!');
  console.log('Block:', receipt.blockNumber);
  console.log('Gas used:', receipt.gasUsed.toString());
  console.log('\n🔗 https://basescan.org/tx/' + txResponse.hash);
  
} catch (error: any) {
  console.error('\n❌ Execution failed:', error.message);
  if (error.shortMessage) console.error('Short:', error.shortMessage);
}
