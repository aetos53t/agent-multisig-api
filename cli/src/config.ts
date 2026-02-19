import Conf from 'conf';
import { homedir } from 'os';
import { join } from 'path';

export interface AgentConfig {
  agentId?: string;
  name?: string;
  provider?: string;
  publicKey?: string;
  webhookUrl?: string;
  apiUrl: string;
  testnet: boolean;
  registeredAt?: string;
}

const configPath = join(homedir(), '.agent-multisig');

const config = new Conf<AgentConfig>({
  projectName: 'agent-multisig',
  cwd: configPath,
  defaults: {
    apiUrl: 'https://api.agentmultisig.dev',
    testnet: false
  }
});

export function getConfig(): AgentConfig {
  return {
    agentId: config.get('agentId'),
    name: config.get('name'),
    provider: config.get('provider'),
    publicKey: config.get('publicKey'),
    webhookUrl: config.get('webhookUrl'),
    apiUrl: config.get('apiUrl'),
    testnet: config.get('testnet'),
    registeredAt: config.get('registeredAt')
  };
}

export function setConfig(updates: Partial<AgentConfig>): void {
  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      config.set(key as keyof AgentConfig, value);
    }
  }
}

export function clearConfig(): void {
  config.clear();
}

export function getConfigPath(): string {
  return configPath;
}
