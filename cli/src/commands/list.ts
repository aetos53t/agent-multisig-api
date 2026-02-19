import chalk from 'chalk';
import ora from 'ora';
import { getConfig } from '../config.js';

interface ListOptions {
  all?: boolean;
}

export async function listCommand(options: ListOptions) {
  const config = getConfig();
  
  if (!config.agentId) {
    console.log(chalk.red('Not registered. Run: agent-multisig init'));
    process.exit(1);
  }
  
  const spinner = ora('Fetching proposals...').start();
  
  try {
    const status = options.all ? '' : '&status=pending';
    const response = await fetch(
      `${config.apiUrl}/v1/proposals?agentId=${config.agentId}${status}`,
      { signal: AbortSignal.timeout(10000) }
    );
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    
    const result = await response.json();
    const proposals = result.data || [];
    
    spinner.stop();
    
    if (proposals.length === 0) {
      console.log(chalk.dim('\nNo proposals found.'));
      if (!options.all) {
        console.log(chalk.dim('Use --all to see signed/completed proposals.'));
      }
      return;
    }
    
    console.log(chalk.bold(`\n📋 Proposals (${proposals.length})\n`));
    
    for (const p of proposals) {
      const statusColors: Record<string, typeof chalk.yellow> = {
        pending: chalk.yellow,
        signed: chalk.blue,
        ready: chalk.cyan,
        broadcast: chalk.green,
        failed: chalk.red
      };
      const statusColor = statusColors[p.status as string] || chalk.white;
      
      console.log(chalk.dim('─'.repeat(60)));
      console.log(`  ID:       ${chalk.cyan(p.id)}`);
      console.log(`  Status:   ${statusColor(p.status)}`);
      console.log(`  Multisig: ${p.multisigId}`);
      console.log(`  Created:  ${new Date(p.createdAt).toLocaleString()}`);
      
      if (p.outputs?.length) {
        console.log(`  Outputs:`);
        for (const out of p.outputs) {
          console.log(`    → ${out.address?.slice(0, 20)}... : ${formatAmount(out.amount)}`);
        }
      }
      
      if (p.note) {
        console.log(`  Note:     ${p.note}`);
      }
      
      const needsMySignature = p.requiredSigners?.includes(config.agentId) && 
                               !p.signatures?.some((s: any) => s.agentId === config.agentId);
      
      if (needsMySignature) {
        console.log(chalk.yellow(`\n  ⚡ Needs your signature!`));
        console.log(chalk.dim(`     Run: agent-multisig sign ${p.id}`));
      }
      console.log();
    }
    
  } catch (err: any) {
    spinner.fail('Failed to fetch proposals');
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
