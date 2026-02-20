import Safe from '@safe-global/protocol-kit';
import { predictSafeAddress, SAFE_ADDRESSES } from './src/adapters/evm-safe';

const keysData = await Bun.file('/Users/aetos/.openclaw/workspace/credentials/demo-safe-keys.json').json();

console.log('=== Debugging Safe Address Prediction ===\n');
console.log('Owners:', keysData.sortedOwners);
console.log('Threshold:', keysData.threshold);

// Our prediction
const ourPrediction = predictSafeAddress(
  { owners: keysData.sortedOwners, threshold: keysData.threshold },
  'base'
);
console.log('\nOur prediction:', ourPrediction);

// SDK prediction with various salt nonces
const RPC_URL = 'https://mainnet.base.org';

for (const saltNonce of ['0', '1', '1234', Date.now().toString()]) {
  const protocolKit = await Safe.init({
    provider: RPC_URL,
    signer: keysData.keys[0].privateKey,
    predictedSafe: {
      safeAccountConfig: {
        owners: keysData.sortedOwners,
        threshold: keysData.threshold,
      },
      safeDeploymentConfig: {
        saltNonce,
      },
    },
  });
  
  const sdkPrediction = await protocolKit.getAddress();
  console.log(`SDK (salt=${saltNonce}):`, sdkPrediction);
  
  if (sdkPrediction.toLowerCase() === ourPrediction.toLowerCase()) {
    console.log('  ✓ MATCH!');
    break;
  }
}

// Try with specific timestamp around when we generated
console.log('\nTrying timestamp-based salts...');
const baseTimes = [0, 1, 2, 3, 4, 5];
for (const t of baseTimes) {
  const protocolKit = await Safe.init({
    provider: RPC_URL,
    signer: keysData.keys[0].privateKey,
    predictedSafe: {
      safeAccountConfig: {
        owners: keysData.sortedOwners,
        threshold: keysData.threshold,
      },
      safeDeploymentConfig: {
        saltNonce: t.toString(),
      },
    },
  });
  
  const sdkPrediction = await protocolKit.getAddress();
  if (sdkPrediction.toLowerCase() === ourPrediction.toLowerCase()) {
    console.log(`FOUND! Salt nonce = ${t}`);
    console.log('Address:', sdkPrediction);
    break;
  }
}

// Check what our prediction function uses for salt
console.log('\n=== Safe Contract Addresses ===');
console.log('Singleton:', SAFE_ADDRESSES.singleton);
console.log('Singleton L2:', SAFE_ADDRESSES.singletonL2);
console.log('Proxy Factory:', SAFE_ADDRESSES.proxyFactory);
