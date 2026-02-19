import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { getConfig, setConfig, getConfigPath } from '../config.js';

const PROVIDERS = {
  aibtc: {
    name: 'aibtc MCP Server',
    description: 'Bitcoin Taproot keys via MCP',
    keyFormat: 'x-only (32 bytes / 64 hex chars)',
    keyHelp: 'Run: wallet_get_info → use taprootPublicKey'
  },
  clawcash: {
    name: 'Claw Cash',
    description: 'Secure enclave Bitcoin wallet',
    keyFormat: 'x-only (32 bytes / 64 hex chars)',
    keyHelp: 'Run: cash pubkey → use the taproot key'
  },
  bankr: {
    name: 'Bankr',
    description: 'EVM agent wallet with Safe support',
    keyFormat: 'Ethereum address (20 bytes / 40 hex chars)',
    keyHelp: 'Check your Bankr dashboard for your agent address'
  },
  custom: {
    name: 'Custom / Manual',
    description: 'Bring your own keys',
    keyFormat: 'Depends on chain (Bitcoin: 32-byte x-only, EVM: 20-byte address)',
    keyHelp: 'Enter your public key manually'
  }
};

interface InitOptions {
  provider?: string;
  name?: string;
  publicKey?: string;
  webhook?: string;
  api?: string;
  testnet?: boolean;
}

export async function initCommand(options: InitOptions) {
  console.log(chalk.bold('\n🚀 Agent Multisig Setup\n'));
  
  // Check if already registered
  const existing = getConfig();
  if (existing.agentId) {
    const { overwrite } = await inquirer.prompt([{
      type: 'confirm',
      name: 'overwrite',
      message: `Already registered as ${chalk.cyan(existing.agentId)}. Overwrite?`,
      default: false
    }]);
    
    if (!overwrite) {
      console.log(chalk.yellow('\nKeeping existing registration. Run `agent-multisig status` to check health.'));
      return;
    }
  }
  
  // Step 1: Select provider
  let provider = options.provider;
  if (!provider) {
    const { selectedProvider } = await inquirer.prompt([{
      type: 'list',
      name: 'selectedProvider',
      message: 'Which wallet provider are you using?',
      choices: Object.entries(PROVIDERS).map(([key, p]) => ({
        name: `${p.name} - ${p.description}`,
        value: key
      }))
    }]);
    provider = selectedProvider;
  }
  
  const providerInfo = PROVIDERS[provider as keyof typeof PROVIDERS] || PROVIDERS.custom;
  
  console.log(chalk.dim(`\nKey format: ${providerInfo.keyFormat}`));
  console.log(chalk.dim(`How to get: ${providerInfo.keyHelp}\n`));
  
  // Step 2: Get public key
  let publicKey = options.publicKey;
  if (!publicKey) {
    // Try to auto-detect based on provider
    if (provider === 'aibtc') {
      console.log(chalk.yellow('Tip: If you have aibtc MCP, you can get your key with wallet_get_info'));
    }
    
    const { key } = await inquirer.prompt([{
      type: 'input',
      name: 'key',
      message: 'Enter your public key (hex):',
      validate: (input: string) => {
        const clean = input.toLowerCase().replace('0x', '');
        if (!/^[0-9a-f]+$/.test(clean)) {
          return 'Invalid hex string';
        }
        if (provider === 'bankr' && clean.length !== 40) {
          return 'EVM address should be 40 hex chars (20 bytes)';
        }
        if ((provider === 'aibtc' || provider === 'clawcash') && clean.length !== 64) {
          return 'Taproot x-only pubkey should be 64 hex chars (32 bytes)';
        }
        return true;
      }
    }]);
    publicKey = key.toLowerCase().replace('0x', '');
  }
  
  // Ensure publicKey is defined at this point
  if (!publicKey) {
    console.log(chalk.red('Public key is required'));
    process.exit(1);
  }
  
  // Step 3: Agent name
  let name = options.name;
  if (!name) {
    const { agentName } = await inquirer.prompt([{
      type: 'input',
      name: 'agentName',
      message: 'Agent display name:',
      default: `Agent-${publicKey.slice(0, 8)}`
    }]);
    name = agentName;
  }
  
  // Step 4: Webhook (optional)
  let webhookUrl = options.webhook;
  if (!webhookUrl) {
    const { wantWebhook } = await inquirer.prompt([{
      type: 'confirm',
      name: 'wantWebhook',
      message: 'Set up webhook for signing notifications?',
      default: false
    }]);
    
    if (wantWebhook) {
      const { url } = await inquirer.prompt([{
        type: 'input',
        name: 'url',
        message: 'Webhook URL:',
        validate: (input: string) => {
          try {
            new URL(input);
            return true;
          } catch {
            return 'Invalid URL';
          }
        }
      }]);
      webhookUrl = url;
    }
  }
  
  // Step 5: API URL
  const apiUrl = options.api || 'https://api.agentmultisig.dev';
  const testnet = options.testnet || false;
  
  // Step 6: Register!
  const spinner = ora('Registering with coordination API...').start();
  
  try {
    const response = await fetch(`${apiUrl}/v1/agents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        provider,
        publicKey,
        webhookUrl,
        network: testnet ? 'testnet' : 'mainnet'
      })
    });
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(error.message || `Registration failed: ${response.status}`);
    }
    
    const result = await response.json();
    const agentId = result.data?.id || result.id;
    
    if (!agentId) {
      throw new Error('No agent ID returned from API');
    }
    
    // Save config
    setConfig({
      agentId,
      name,
      provider,
      publicKey,
      webhookUrl,
      apiUrl,
      testnet,
      registeredAt: new Date().toISOString()
    });
    
    spinner.succeed('Registered successfully!');
    
    // Success output
    console.log(chalk.bold('\n✅ You\'re all set!\n'));
    console.log(chalk.dim('─'.repeat(50)));
    console.log(`  Agent ID:    ${chalk.cyan(agentId)}`);
    console.log(`  Name:        ${name}`);
    console.log(`  Provider:    ${chalk.green(provider)}`);
    console.log(`  Public Key:  ${publicKey.slice(0, 16)}...${publicKey.slice(-8)}`);
    console.log(`  Network:     ${testnet ? chalk.yellow('testnet') : chalk.green('mainnet')}`);
    console.log(`  Config:      ${getConfigPath()}`);
    console.log(chalk.dim('─'.repeat(50)));
    
    console.log(chalk.bold('\n📋 Next Steps:\n'));
    console.log('  1. Join a multisig:');
    console.log(chalk.dim('     Share your agent ID with the multisig creator'));
    console.log();
    console.log('  2. Or create one yourself:');
    console.log(chalk.cyan(`     curl -X POST ${apiUrl}/v1/multisigs ...`));
    console.log();
    console.log('  3. Check for pending proposals:');
    console.log(chalk.cyan('     agent-multisig list'));
    console.log();
    console.log('  4. Sign when ready:');
    console.log(chalk.cyan('     agent-multisig sign <proposalId>'));
    console.log();
    
    if (webhookUrl) {
      console.log(chalk.green('  ✓ Webhook configured - you\'ll receive POST requests when proposals need signing'));
    } else {
      console.log(chalk.yellow('  ⚠ No webhook - poll `agent-multisig list` to check for pending proposals'));
    }
    console.log();
    
  } catch (err: any) {
    spinner.fail('Registration failed');
    
    if (err.message.includes('fetch')) {
      console.log(chalk.red(`\nCouldn't reach API at ${apiUrl}`));
      console.log(chalk.dim('Is the server running? Check with: curl ' + apiUrl + '/health'));
    } else {
      console.log(chalk.red(`\n${err.message}`));
    }
    
    console.log(chalk.dim('\nYour inputs (save these):'));
    console.log(chalk.dim(`  Provider: ${provider}`));
    console.log(chalk.dim(`  Public Key: ${publicKey}`));
    console.log(chalk.dim(`  Name: ${name}`));
    
    process.exit(1);
  }
}
