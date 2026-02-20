import { 
  createPublicClient, 
  createWalletClient,
  http, 
  encodeFunctionData,
  encodeAbiParameters,
  parseAbiParameters,
  parseAbi,
  formatEther,
  keccak256,
  concat,
  pad,
  toHex,
} from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

const keysData = await Bun.file('/Users/aetos/.openclaw/workspace/credentials/demo-safe-keys.json').json();

console.log('=== Manual Safe Deployment ===\n');

const RPC_URL = 'https://mainnet.base.org';
const TARGET_SAFE = keysData.safeAddress as `0x${string}`;

// Exact params that produce our address
const SAFE_L2_SINGLETON = '0x3E5c63644E683549055b9Be8653de26E0B4CD36E' as const;
const PROXY_FACTORY = '0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2' as const;
const FALLBACK_HANDLER = '0xf48f2B2d2a534e402487b3ee7C18c33Aec0Fe5e4' as const;
const SALT_NONCE = 0n;

const owners = keysData.sortedOwners as `0x${string}`[];
const threshold = BigInt(keysData.threshold);

console.log('Target Safe:', TARGET_SAFE);
console.log('Singleton:', SAFE_L2_SINGLETON);
console.log('Factory:', PROXY_FACTORY);
console.log('Salt Nonce:', SALT_NONCE.toString());

// Setup clients
const publicClient = createPublicClient({ chain: base, transport: http(RPC_URL) });

// Use first signer for deployment gas
const deployer = privateKeyToAccount(keysData.keys[0].privateKey as `0x${string}`);
const walletClient = createWalletClient({
  account: deployer,
  chain: base,
  transport: http(RPC_URL),
});

console.log('\nDeployer:', deployer.address);

// Check deployer has ETH for gas
const deployerBalance = await publicClient.getBalance({ address: deployer.address });
console.log('Deployer ETH:', formatEther(deployerBalance));

// Check Safe address balance
const safeBalance = await publicClient.getBalance({ address: TARGET_SAFE });
console.log('Safe ETH:', formatEther(safeBalance));

// Build initializer (Safe.setup call)
const initializer = encodeFunctionData({
  abi: parseAbi([
    'function setup(address[] calldata _owners, uint256 _threshold, address to, bytes calldata data, address fallbackHandler, address paymentToken, uint256 payment, address paymentReceiver)'
  ]),
  functionName: 'setup',
  args: [
    owners,
    threshold,
    '0x0000000000000000000000000000000000000000' as `0x${string}`,
    '0x' as `0x${string}`,
    FALLBACK_HANDLER,
    '0x0000000000000000000000000000000000000000' as `0x${string}`,
    0n,
    '0x0000000000000000000000000000000000000000' as `0x${string}`,
  ],
});

console.log('\nInitializer:', initializer.slice(0, 66) + '...');

// Check if already deployed
const code = await publicClient.getBytecode({ address: TARGET_SAFE });
if (code && code !== '0x') {
  console.log('\n✓ Safe already deployed!');
} else {
  console.log('\n=== Deploying Safe ===');
  
  // Call createProxyWithNonce on factory
  const deployData = encodeFunctionData({
    abi: parseAbi([
      'function createProxyWithNonce(address _singleton, bytes memory initializer, uint256 saltNonce) returns (address proxy)'
    ]),
    functionName: 'createProxyWithNonce',
    args: [SAFE_L2_SINGLETON, initializer, SALT_NONCE],
  });
  
  console.log('Calling createProxyWithNonce...');
  
  // Estimate gas
  const gasEstimate = await publicClient.estimateGas({
    account: deployer.address,
    to: PROXY_FACTORY,
    data: deployData,
  });
  console.log('Estimated gas:', gasEstimate.toString());
  
  // Send deployment tx
  const hash = await walletClient.sendTransaction({
    to: PROXY_FACTORY,
    data: deployData,
    gas: gasEstimate * 12n / 10n, // 20% buffer
  });
  
  console.log('Tx hash:', hash);
  console.log('\nWaiting for confirmation...');
  
  const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 120000 });
  
  if (receipt.status === 'success') {
    console.log('\n✅ Safe DEPLOYED!');
    console.log('Block:', receipt.blockNumber);
    console.log('Gas used:', receipt.gasUsed.toString());
    console.log('\n🔗 https://basescan.org/tx/' + hash);
  } else {
    console.log('\n❌ Deployment failed');
    process.exit(1);
  }
}

// Verify deployment
const deployedCode = await publicClient.getBytecode({ address: TARGET_SAFE });
console.log('\nSafe has code:', deployedCode && deployedCode !== '0x' ? 'YES ✓' : 'NO');
