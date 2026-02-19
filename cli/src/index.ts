#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import { initCommand } from './commands/init.js';
import { statusCommand } from './commands/status.js';
import { signCommand } from './commands/sign.js';
import { listCommand } from './commands/list.js';

const program = new Command();

program
  .name('agent-multisig')
  .description('One-command agent onboarding for multi-agent wallets')
  .version('0.1.0');

program
  .command('init')
  .description('Register your agent with the coordination API')
  .option('-p, --provider <provider>', 'Wallet provider (aibtc, clawcash, bankr, custom)')
  .option('-n, --name <name>', 'Agent display name')
  .option('-k, --public-key <key>', 'Your public key (hex)')
  .option('-w, --webhook <url>', 'Webhook URL for signing requests')
  .option('--api <url>', 'API URL (default: https://api.agentmultisig.dev)')
  .option('--testnet', 'Use testnet/signet mode')
  .action(initCommand);

program
  .command('status')
  .description('Check your registration and health')
  .action(statusCommand);

program
  .command('sign <proposalId>')
  .description('Sign a proposal')
  .option('--digest <hex>', 'Sign a specific digest (advanced)')
  .action(signCommand);

program
  .command('list')
  .alias('ls')
  .description('List proposals awaiting your signature')
  .option('-a, --all', 'Show all proposals (including signed)')
  .action(listCommand);

program
  .command('whoami')
  .description('Show your agent info')
  .action(async () => {
    const { getConfig } = await import('./config.js');
    const config = getConfig();
    
    if (!config.agentId) {
      console.log(chalk.yellow('Not registered. Run: agent-multisig init'));
      return;
    }
    
    console.log(chalk.bold('\n🤖 Agent Info\n'));
    console.log(`  ID:        ${chalk.cyan(config.agentId)}`);
    console.log(`  Name:      ${config.name || '(not set)'}`);
    console.log(`  Provider:  ${chalk.green(config.provider)}`);
    console.log(`  Public Key: ${config.publicKey?.slice(0, 16)}...${config.publicKey?.slice(-8)}`);
    console.log(`  API:       ${config.apiUrl}`);
    console.log(`  Network:   ${config.testnet ? chalk.yellow('testnet') : chalk.green('mainnet')}`);
    console.log();
  });

// Nice error handling
program.exitOverride();

try {
  await program.parseAsync();
} catch (err: any) {
  if (err.code === 'commander.help' || err.code === 'commander.version') {
    process.exit(0);
  }
  console.error(chalk.red(`Error: ${err.message}`));
  process.exit(1);
}
