import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { getConfig } from '../config.js';

interface SignOptions {
  digest?: string;
}

export async function signCommand(proposalId: string, options: SignOptions) {
  const config = getConfig();
  
  if (!config.agentId) {
    console.log(chalk.red('Not registered. Run: agent-multisig init'));
    process.exit(1);
  }
  
  console.log(chalk.bold('\n✍️  Sign Proposal\n'));
  
  // Step 1: Fetch proposal details
  const fetchSpinner = ora('Fetching proposal...').start();
  
  let proposal: any;
  let payload: any;
  
  try {
    const propRes = await fetch(`${config.apiUrl}/v1/proposals/${proposalId}`);
    if (!propRes.ok) {
      if (propRes.status === 404) {
        throw new Error('Proposal not found');
      }
      throw new Error(`API error: ${propRes.status}`);
    }
    proposal = await propRes.json();
    
    // Get signing payload
    const payloadRes = await fetch(
      `${config.apiUrl}/v1/proposals/${proposalId}/payload/${config.agentId}`
    );
    if (!payloadRes.ok) {
      throw new Error('Could not get signing payload');
    }
    payload = await payloadRes.json();
    
    fetchSpinner.succeed('Proposal loaded');
  } catch (err: any) {
    fetchSpinner.fail('Failed to fetch proposal');
    console.log(chalk.red(`\n${err.message}`));
    process.exit(1);
  }
  
  // Step 2: Show what we're signing
  console.log(chalk.dim('\n─'.repeat(50)));
  console.log(chalk.bold('\n📄 Transaction Details:\n'));
  
  const data = proposal.data || proposal;
  
  console.log(`  Proposal:  ${chalk.cyan(proposalId)}`);
  console.log(`  Multisig:  ${data.multisigId}`);
  console.log(`  Status:    ${data.status}`);
  
  if (data.outputs?.length) {
    console.log(chalk.bold('\n  Outputs:'));
    for (const out of data.outputs) {
      const addr = out.address?.length > 40 
        ? `${out.address.slice(0, 20)}...${out.address.slice(-8)}`
        : out.address;
      console.log(`    → ${addr}`);
      console.log(`      Amount: ${formatAmount(out.amount)}`);
    }
  }
  
  if (data.note) {
    console.log(`\n  Note: ${data.note}`);
  }
  
  console.log(chalk.bold('\n  Digest to sign:'));
  console.log(chalk.cyan(`    ${payload.data?.digest || payload.digest}`));
  
  console.log(chalk.dim('\n─'.repeat(50)));
  
  // Step 3: Confirm
  const { confirm } = await inquirer.prompt([{
    type: 'confirm',
    name: 'confirm',
    message: 'Sign this transaction?',
    default: true
  }]);
  
  if (!confirm) {
    console.log(chalk.yellow('\nAborted.'));
    return;
  }
  
  // Step 4: Get signature
  console.log(chalk.bold('\n🔐 Signing\n'));
  
  const digest = payload.data?.digest || payload.digest;
  
  // Provider-specific signing instructions
  let signature: string;
  
  if (config.provider === 'aibtc') {
    console.log(chalk.dim('Sign with aibtc MCP:\n'));
    console.log(chalk.cyan(`  schnorr_sign_digest({ digest: "${digest}" })`));
    console.log();
    
    const { sig } = await inquirer.prompt([{
      type: 'input',
      name: 'sig',
      message: 'Paste 64-byte signature (hex):',
      validate: (input: string) => {
        const clean = input.toLowerCase().replace('0x', '');
        if (!/^[0-9a-f]{128}$/.test(clean)) {
          return 'Signature must be 128 hex chars (64 bytes)';
        }
        return true;
      }
    }]);
    signature = sig.toLowerCase().replace('0x', '');
    
  } else if (config.provider === 'clawcash') {
    console.log(chalk.dim('Sign with Claw Cash:\n'));
    console.log(chalk.cyan(`  cash sign-digest ${digest}`));
    console.log();
    
    const { sig } = await inquirer.prompt([{
      type: 'input',
      name: 'sig',
      message: 'Paste signature (hex):',
      validate: (input: string) => {
        const clean = input.toLowerCase().replace('0x', '');
        return /^[0-9a-f]+$/.test(clean) || 'Invalid hex';
      }
    }]);
    signature = sig.toLowerCase().replace('0x', '');
    
  } else if (config.provider === 'bankr') {
    console.log(chalk.dim('Sign with Bankr API:\n'));
    console.log(chalk.cyan(`  POST https://api.bankr.bot/agent/sign`));
    console.log(chalk.cyan(`  { "signatureType": "eth_sign", "message": "${digest}" }`));
    console.log();
    
    const { sig } = await inquirer.prompt([{
      type: 'input',
      name: 'sig',
      message: 'Paste signature:',
      validate: (input: string) => {
        const clean = input.toLowerCase().replace('0x', '');
        return /^[0-9a-f]+$/.test(clean) || 'Invalid hex';
      }
    }]);
    signature = sig.toLowerCase().replace('0x', '');
    
  } else {
    // Custom provider - just ask for signature
    const { sig } = await inquirer.prompt([{
      type: 'input',
      name: 'sig',
      message: 'Paste your signature (hex):',
      validate: (input: string) => {
        const clean = input.toLowerCase().replace('0x', '');
        return /^[0-9a-f]+$/.test(clean) || 'Invalid hex';
      }
    }]);
    signature = sig.toLowerCase().replace('0x', '');
  }
  
  // Step 5: Submit signature
  const submitSpinner = ora('Submitting signature...').start();
  
  try {
    const response = await fetch(`${config.apiUrl}/v1/proposals/${proposalId}/sign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: config.agentId,
        signature
      })
    });
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || `Failed: ${response.status}`);
    }
    
    const result = await response.json();
    submitSpinner.succeed('Signature submitted!');
    
    // Check if threshold reached
    const sigCount = result.data?.signatureCount || result.signatureCount;
    const threshold = result.data?.threshold || result.threshold;
    
    console.log(chalk.bold('\n✅ Done!\n'));
    
    if (sigCount >= threshold) {
      console.log(chalk.green(`  🎉 Threshold reached (${sigCount}/${threshold})`));
      console.log(chalk.dim('     Proposal ready for finalization'));
    } else {
      console.log(chalk.yellow(`  ⏳ ${sigCount}/${threshold} signatures collected`));
      console.log(chalk.dim('     Waiting for other signers...'));
    }
    console.log();
    
  } catch (err: any) {
    submitSpinner.fail('Failed to submit signature');
    console.log(chalk.red(`\n${err.message}`));
    process.exit(1);
  }
}

function formatAmount(amount: string | number): string {
  const n = typeof amount === 'string' ? parseInt(amount) : amount;
  if (n >= 1e8) {
    return `${(n / 1e8).toFixed(8)} BTC`;
  } else if (n >= 1e18) {
    return `${(n / 1e18).toFixed(4)} ETH`;
  }
  return `${n} sats`;
}
