import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { predictSafeAddress } from './src/adapters/evm-safe';

console.log('=== Generating 3 EVM Test Keys for Base Safe ===\n');

// Generate 3 random private keys
const keys = [
  { name: 'ALPHA', privateKey: generatePrivateKey() },
  { name: 'BETA', privateKey: generatePrivateKey() },
  { name: 'GAMMA', privateKey: generatePrivateKey() },
];

const accounts = keys.map(k => ({
  ...k,
  account: privateKeyToAccount(k.privateKey),
}));

console.log('Keys generated:');
accounts.forEach(a => {
  console.log(`  ${a.name}: ${a.account.address}`);
  console.log(`    Private: ${a.privateKey}`);
});

// Sort by address (Safe requires sorted owners)
const sortedAddresses = accounts
  .map(a => a.account.address)
  .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())) as `0x${string}`[];

console.log('\nSorted owners:', sortedAddresses);

// Predict Safe address on Base
const safeAddress = predictSafeAddress(
  { owners: sortedAddresses, threshold: 2 },
  'base'
);

console.log('\n=== PREDICTED SAFE ADDRESS (BASE) ===');
console.log(safeAddress);
console.log('\nFund this address with ETH on Base to test!');
console.log('Explorer: https://basescan.org/address/' + safeAddress);

// Save keys to file
const keysData = {
  chain: 'base',
  threshold: 2,
  totalSigners: 3,
  safeAddress,
  keys: accounts.map(a => ({
    name: a.name,
    address: a.account.address,
    privateKey: a.privateKey,
  })),
  sortedOwners: sortedAddresses,
};

await Bun.write(
  '/Users/aetos/.openclaw/workspace/credentials/demo-safe-keys.json',
  JSON.stringify(keysData, null, 2)
);

console.log('\nKeys saved to credentials/demo-safe-keys.json');
