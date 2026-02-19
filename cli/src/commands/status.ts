import chalk from 'chalk';
import ora from 'ora';
import { getConfig } from '../config.js';

export async function statusCommand() {
  const config = getConfig();
  
  console.log(chalk.bold('\n🔍 Agent Status Check\n'));
  
  // Check local config
  if (!config.agentId) {
    console.log(chalk.red('✗ Not registered'));
    console.log(chalk.dim('  Run: agent-multisig init'));
    return;
  }
  
  console.log(chalk.green('✓ Local config found'));
  console.log(chalk.dim(`  Agent ID: ${config.agentId}`));
  console.log(chalk.dim(`  Registered: ${config.registeredAt || 'unknown'}`));
  
  // Check API health
  const spinner = ora('Checking API connection...').start();
  
  try {
    const healthRes = await fetch(`${config.apiUrl}/health`, {
      signal: AbortSignal.timeout(5000)
    });
    
    if (healthRes.ok) {
      spinner.succeed('API reachable');
    } else {
      spinner.warn(`API returned ${healthRes.status}`);
    }
  } catch (err) {
    spinner.fail('Cannot reach API');
    console.log(chalk.dim(`  URL: ${config.apiUrl}`));
  }
  
  // Check agent registration on server
  const regSpinner = ora('Verifying registration...').start();
  
  try {
    const agentRes = await fetch(`${config.apiUrl}/v1/agents/${config.agentId}`, {
      signal: AbortSignal.timeout(5000)
    });
    
    if (agentRes.ok) {
      const agent = await agentRes.json();
      regSpinner.succeed('Agent verified on server');
      
      // Check for pending proposals
      const proposalRes = await fetch(
        `${config.apiUrl}/v1/proposals?agentId=${config.agentId}&status=pending`,
        { signal: AbortSignal.timeout(5000) }
      );
      
      if (proposalRes.ok) {
        const proposals = await proposalRes.json();
        const pending = proposals.data?.length || 0;
        
        if (pending > 0) {
          console.log(chalk.yellow(`\n⚠ ${pending} proposal(s) awaiting your signature`));
          console.log(chalk.dim('  Run: agent-multisig list'));
        } else {
          console.log(chalk.green('\n✓ No pending proposals'));
        }
      }
      
    } else if (agentRes.status === 404) {
      regSpinner.fail('Agent not found on server');
      console.log(chalk.yellow('  Your local config may be stale. Re-register with: agent-multisig init'));
    } else {
      regSpinner.warn(`Server returned ${agentRes.status}`);
    }
  } catch (err) {
    regSpinner.fail('Could not verify registration');
  }
  
  // Summary
  console.log(chalk.dim('\n─'.repeat(50)));
  console.log(chalk.bold('\n📊 Summary:\n'));
  console.log(`  Network:    ${config.testnet ? chalk.yellow('testnet') : chalk.green('mainnet')}`);
  console.log(`  Provider:   ${config.provider}`);
  console.log(`  Webhook:    ${config.webhookUrl || chalk.dim('not configured')}`);
  console.log(`  Config:     ~/.agent-multisig/config.json`);
  console.log();
}
