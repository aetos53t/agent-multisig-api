#!/usr/bin/env npx tsx
/**
 * Solana Squads E2E Test (Devnet) - v2 with better faucet handling
 */

import { Keypair, Connection, LAMPORTS_PER_SOL, PublicKey, Transaction, SystemProgram } from '@solana/web3.js';
import * as multisig from '@sqds/multisig';

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

// Try multiple RPC endpoints
const RPC_ENDPOINTS = [
  'https://api.devnet.solana.com',
  'https://devnet.helius-rpc.com/?api-key=1d8740dc-e5f4-421c-b823-e1bad1889eff',
];

async function requestAirdropWithRetry(pubkey: PublicKey, sol: number = 1): Promise<{ success: boolean; connection: Connection }> {
  for (const rpc of RPC_ENDPOINTS) {
    const conn = new Connection(rpc, 'confirmed');
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        info(`Trying ${rpc.includes('helius') ? 'Helius' : 'Solana'} RPC (attempt ${attempt + 1})...`);
        const sig = await conn.requestAirdrop(pubkey, sol * LAMPORTS_PER_SOL);
        await conn.confirmTransaction(sig, 'confirmed');
        return { success: true, connection: conn };
      } catch (e: any) {
        if (attempt < 2) await new Promise(r => setTimeout(r, 2000));
      }
    }
  }
  return { success: false, connection: new Connection(RPC_ENDPOINTS[0]) };
}

async function main() {
  log('\n═══════════════════════════════════════════════════════════════');
  log('  SOLANA SQUADS E2E TEST (DEVNET)', CYAN);
  log('═══════════════════════════════════════════════════════════════\n');

  step('Step 1: Generate test keypairs');

  const member1 = Keypair.generate();
  const member2 = Keypair.generate();
  const createKey = Keypair.generate();

  info(`Member 1: ${member1.publicKey.toBase58().slice(0, 20)}...`);
  info(`Member 2: ${member2.publicKey.toBase58().slice(0, 20)}...`);
  info(`Create Key: ${createKey.publicKey.toBase58().slice(0, 20)}...`);

  step('Step 2: Request devnet SOL (faucet)');

  const { success: airdropSuccess, connection } = await requestAirdropWithRetry(member1.publicKey, 2);
  
  if (!airdropSuccess) {
    error('All faucet attempts failed');
    info('Manual workaround: solana airdrop 2 ' + member1.publicKey.toBase58() + ' --url devnet');
    process.exit(1);
  }

  const balance = await connection.getBalance(member1.publicKey);
  success(`Airdrop received! Balance: ${balance / LAMPORTS_PER_SOL} SOL`);

  step('Step 3: Predict multisig address');

  const [multisigPda] = multisig.getMultisigPda({ createKey: createKey.publicKey });
  const [vaultPda] = multisig.getVaultPda({ multisigPda, index: 0 });

  info(`Multisig PDA: ${multisigPda.toBase58()}`);
  info(`Vault PDA: ${vaultPda.toBase58()}`);
  success('Addresses computed');

  step('Step 4: Create 2-of-2 Squads multisig');

  const createIx = multisig.instructions.multisigCreateV2({
    createKey: createKey.publicKey,
    creator: member1.publicKey,
    multisigPda,
    configAuthority: null,
    timeLock: 0,
    members: [
      { key: member1.publicKey, permissions: multisig.types.Permissions.all() },
      { key: member2.publicKey, permissions: multisig.types.Permissions.all() },
    ],
    threshold: 2,
    rentCollector: null,
    treasury: member1.publicKey,
  });

  const createTx = new Transaction().add(createIx);
  createTx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  createTx.feePayer = member1.publicKey;
  createTx.sign(createKey, member1);

  info('Broadcasting create transaction...');
  const createSig = await connection.sendRawTransaction(createTx.serialize());
  await connection.confirmTransaction(createSig, 'confirmed');

  success(`Multisig created! Tx: ${createSig.slice(0, 20)}...`);

  // Verify
  const multisigAccount = await multisig.accounts.Multisig.fromAccountAddress(connection, multisigPda);
  success('Verified on-chain!');
  info(`  Threshold: ${multisigAccount.threshold}-of-${multisigAccount.members.length}`);

  step('Step 5: Fund the vault');

  const fundTx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: member1.publicKey,
      toPubkey: vaultPda,
      lamports: 0.1 * LAMPORTS_PER_SOL,
    })
  );
  fundTx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  fundTx.feePayer = member1.publicKey;
  fundTx.sign(member1);

  const fundSig = await connection.sendRawTransaction(fundTx.serialize());
  await connection.confirmTransaction(fundSig, 'confirmed');

  const vaultBalance = await connection.getBalance(vaultPda);
  success(`Vault funded! Balance: ${vaultBalance / LAMPORTS_PER_SOL} SOL`);

  log('\n═══════════════════════════════════════════════════════════════');
  log('  SOLANA SQUADS E2E COMPLETE ✅', GREEN);
  log('═══════════════════════════════════════════════════════════════');
  log(`
  Results:
    • Real Squads v4 multisig on Solana devnet
    • On-chain verified
    
  Details:
    • Multisig: ${multisigPda.toBase58()}
    • Vault: ${vaultPda.toBase58()}
    • Threshold: 2-of-2
    • Vault Balance: ${vaultBalance / LAMPORTS_PER_SOL} SOL
    • Create Tx: ${createSig}

  Explorer: https://explorer.solana.com/address/${multisigPda.toBase58()}?cluster=devnet
`);
}

main().catch((err) => {
  error(`E2E test failed: ${err.message}`);
  console.error(err);
  process.exit(1);
});
