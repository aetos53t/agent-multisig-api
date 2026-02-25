#!/usr/bin/env npx tsx
/**
 * Solana Squads E2E Test (Devnet)
 * 
 * Creates a real Squads v4 multisig on Solana devnet.
 * Uses faucet for free SOL - no funds needed.
 */

import { Keypair, Connection, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { SolanaSquadsAdapter } from '../src/adapters/solana-squads';

// ANSI colors
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';

function log(msg: string, color = RESET) { console.log(`${color}${msg}${RESET}`); }
function success(msg: string) { log(`✅ ${msg}`, GREEN); }
function error(msg: string) { log(`❌ ${msg}`, RED); }
function info(msg: string) { log(`ℹ️  ${msg}`, CYAN); }
function step(msg: string) { log(`\n🔹 ${msg}`, YELLOW); }

async function requestAirdrop(connection: Connection, pubkey: string, sol: number = 2): Promise<boolean> {
  try {
    const { Keypair: _, PublicKey } = await import('@solana/web3.js');
    const sig = await connection.requestAirdrop(
      new PublicKey(pubkey),
      sol * LAMPORTS_PER_SOL
    );
    await connection.confirmTransaction(sig, 'confirmed');
    return true;
  } catch (e: any) {
    console.error('Airdrop failed:', e.message);
    return false;
  }
}

async function main() {
  log('\n═══════════════════════════════════════════════════════════════');
  log('  SOLANA SQUADS E2E TEST (DEVNET)', CYAN);
  log('═══════════════════════════════════════════════════════════════\n');

  // ============================================
  // STEP 1: Setup
  // ============================================
  step('Step 1: Generate test keypairs');

  // Generate fresh keypairs for test
  const member1 = Keypair.generate();
  const member2 = Keypair.generate();
  const createKey = Keypair.generate();

  info(`Member 1: ${member1.publicKey.toBase58().slice(0, 20)}...`);
  info(`Member 2: ${member2.publicKey.toBase58().slice(0, 20)}...`);
  info(`Create Key: ${createKey.publicKey.toBase58().slice(0, 20)}...`);

  // Initialize adapter for devnet
  const adapter = new SolanaSquadsAdapter('solana-devnet');
  const connection = new Connection('https://api.devnet.solana.com', 'confirmed');

  success('Adapter initialized for devnet');

  // ============================================
  // STEP 2: Fund the fee payer
  // ============================================
  step('Step 2: Request devnet SOL (faucet)');

  info('Requesting 2 SOL airdrop for member1 (fee payer)...');
  const airdropSuccess = await requestAirdrop(connection, member1.publicKey.toBase58());
  
  if (!airdropSuccess) {
    error('Airdrop failed - devnet faucet may be rate limited');
    info('Try again in a minute, or use: solana airdrop 2 ' + member1.publicKey.toBase58());
    process.exit(1);
  }

  const balance = await connection.getBalance(member1.publicKey);
  success(`Airdrop received! Balance: ${balance / LAMPORTS_PER_SOL} SOL`);

  // ============================================
  // STEP 3: Predict multisig address
  // ============================================
  step('Step 3: Predict multisig address');

  const multisigAddress = adapter.predictMultisigAddress(createKey.publicKey.toBase58());
  const vaultAddress = adapter.predictVaultAddress(multisigAddress);

  info(`Multisig PDA: ${multisigAddress}`);
  info(`Vault PDA: ${vaultAddress}`);

  // Verify not deployed yet
  const existsBefore = await adapter.isMultisigDeployed(multisigAddress);
  if (existsBefore) {
    error('Multisig already exists (collision - very unlikely)');
    process.exit(1);
  }
  success('Address predicted, not yet deployed');

  // ============================================
  // STEP 4: Create the multisig
  // ============================================
  step('Step 4: Create 2-of-2 Squads multisig');

  const { transaction: createTxBase64 } = await adapter.buildCreateMultisigTx({
    createKey: createKey.publicKey.toBase58(),
    members: [
      member1.publicKey.toBase58(),
      member2.publicKey.toBase58(),
    ],
    threshold: 2,
    feePayer: member1.publicKey.toBase58(),
  });

  // Deserialize and sign
  const { Transaction } = await import('@solana/web3.js');
  const createTx = Transaction.from(Buffer.from(createTxBase64, 'base64'));
  
  // Sign with createKey and feePayer
  createTx.sign(createKey, member1);

  // Send transaction
  info('Broadcasting create transaction...');
  const createSig = await connection.sendRawTransaction(createTx.serialize());
  await connection.confirmTransaction(createSig, 'confirmed');

  success(`Multisig created! Signature: ${createSig.slice(0, 20)}...`);

  // Verify deployment
  const existsAfter = await adapter.isMultisigDeployed(multisigAddress);
  if (!existsAfter) {
    error('Multisig not found after create');
    process.exit(1);
  }

  const multisigInfo = await adapter.getMultisig(multisigAddress);
  success('Multisig deployed and verified!');
  info(`  Threshold: ${multisigInfo?.threshold}-of-${multisigInfo?.members.length}`);
  info(`  Members: ${multisigInfo?.members.map(m => m.slice(0, 12) + '...').join(', ')}`);

  // ============================================
  // STEP 5: Fund the vault
  // ============================================
  step('Step 5: Fund the vault');

  const { PublicKey, SystemProgram } = await import('@solana/web3.js');
  
  // Send 0.1 SOL to vault
  const fundAmount = 0.1 * LAMPORTS_PER_SOL;
  const fundTx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: member1.publicKey,
      toPubkey: new PublicKey(vaultAddress),
      lamports: fundAmount,
    })
  );
  fundTx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  fundTx.feePayer = member1.publicKey;
  fundTx.sign(member1);

  const fundSig = await connection.sendRawTransaction(fundTx.serialize());
  await connection.confirmTransaction(fundSig, 'confirmed');

  const vaultBalance = await adapter.getVaultBalance(multisigAddress);
  success(`Vault funded! Balance: ${Number(vaultBalance) / LAMPORTS_PER_SOL} SOL`);

  // ============================================
  // SUMMARY
  // ============================================
  log('\n═══════════════════════════════════════════════════════════════');
  log('  SOLANA SQUADS E2E COMPLETE ✅', GREEN);
  log('═══════════════════════════════════════════════════════════════');
  log(`
  Results:
    • Squads v4 adapter works on devnet
    • Real multisig created on-chain
    • Vault funded with SOL
    
  Multisig Details:
    • Address: ${multisigAddress}
    • Vault: ${vaultAddress}
    • Threshold: 2-of-2
    • Members: ${member1.publicKey.toBase58().slice(0, 12)}..., ${member2.publicKey.toBase58().slice(0, 12)}...
    • Vault Balance: ${Number(vaultBalance) / LAMPORTS_PER_SOL} SOL

  Explorer: https://explorer.solana.com/address/${multisigAddress}?cluster=devnet
`);
}

main().catch((err) => {
  error(`E2E test failed: ${err.message}`);
  console.error(err);
  process.exit(1);
});
