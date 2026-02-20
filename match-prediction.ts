import { 
  createPublicClient, 
  createWalletClient,
  http, 
  encodeFunctionData,
  encodeAbiParameters,
  parseAbiParameters,
  keccak256,
  concat,
  pad,
  toHex,
} from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { SAFE_ADDRESSES } from './src/adapters/evm-safe';

const keysData = await Bun.file('/Users/aetos/.openclaw/workspace/credentials/demo-safe-keys.json').json();

console.log('=== Matching Safe Address Prediction ===\n');

// Our funded address
const TARGET = '0x438b7ff94d3b3858cd02374e98abac400e1ce52c';
console.log('Target (funded):', TARGET);
console.log('Owners:', keysData.sortedOwners);

// Setup initializer (Safe.setup call)
function computeInitializer(owners: `0x${string}`[], threshold: number): `0x${string}` {
  const setupFunctionSelector = '0xb63e800d';
  const fallbackHandler = '0xf48f2B2d2a534e402487b3ee7C18c33Aec0Fe5e4' as const;
  
  const encoded = encodeAbiParameters(
    parseAbiParameters('address[], uint256, address, bytes, address, address, uint256, address'),
    [
      owners,
      BigInt(threshold),
      '0x0000000000000000000000000000000000000000',
      '0x' as `0x${string}`,
      fallbackHandler,
      '0x0000000000000000000000000000000000000000',
      0n,
      '0x0000000000000000000000000000000000000000',
    ]
  );
  
  return (setupFunctionSelector + encoded.slice(2)) as `0x${string}`;
}

// Test different configurations
const owners = keysData.sortedOwners as `0x${string}`[];
const threshold = keysData.threshold;

// For L2 chains like Base, Safe uses SafeL2 singleton
const singletons = [
  { name: 'SafeL2 1.3.0', addr: '0x3E5c63644E683549055b9Be8653de26E0B4CD36E' },
  { name: 'Safe 1.3.0', addr: '0xd9Db270c1B5E3Bd161E8c8503c55cEABeE709552' },
  { name: 'Safe 1.4.1', addr: '0x41675C099F32341bf84BFc5382aF534df5C7461a' },
  { name: 'SafeL2 1.4.1', addr: '0x29fcB43b46531BcA003ddC8FCB67FFE91900C762' },
];

const factories = [
  { name: 'Factory 1.3.0', addr: '0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2' },
  { name: 'Factory 1.4.1', addr: '0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67' },
];

const initializer = computeInitializer(owners, threshold);
console.log('\nInitializer:', initializer.slice(0, 50) + '...');

// Try all combinations
console.log('\nSearching for matching address...');

for (const singleton of singletons) {
  for (const factory of factories) {
    for (let saltNonce = 0n; saltNonce < 10n; saltNonce++) {
      // CREATE2 prediction
      // deploymentData = proxyCreationCode + singleton
      const proxyCreationCode = concat([
        '0x3d602d80600a3d3981f3363d3d373d3d3d363d73' as `0x${string}`,
        singleton.addr as `0x${string}`,
        '0x5af43d82803e903d91602b57fd5bf3' as `0x${string}`,
      ]);
      
      // Salt = keccak256(keccak256(initializer) + saltNonce)
      const salt = keccak256(
        concat([
          keccak256(initializer),
          pad(toHex(saltNonce), { size: 32 }),
        ])
      );
      
      const initCodeHash = keccak256(concat([proxyCreationCode, initializer]));
      
      const create2Hash = keccak256(
        concat([
          '0xff' as `0x${string}`,
          factory.addr as `0x${string}`,
          salt,
          initCodeHash,
        ])
      );
      
      const predicted = ('0x' + create2Hash.slice(26)) as `0x${string}`;
      
      if (predicted.toLowerCase() === TARGET.toLowerCase()) {
        console.log('\n✅ FOUND MATCH!');
        console.log('Singleton:', singleton.name, singleton.addr);
        console.log('Factory:', factory.name, factory.addr);
        console.log('Salt Nonce:', saltNonce.toString());
        console.log('Predicted:', predicted);
        process.exit(0);
      }
    }
  }
}

console.log('\nNo match found with standard configurations.');
console.log('The funded address may use non-standard Safe deployment.');

// Option: Just move funds to SDK-predicted address
console.log('\n=== Alternative Solution ===');
console.log('The funded address is just an EOA right now (no code).');
console.log('We could use SDK address and ask to fund that instead.');
