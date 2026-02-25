import { Provider, IAgentRuntime, Memory, State } from '@elizaos/core';
import { quorumService } from '../services/quorum.js';

export const multisigProvider: Provider = {
  name: 'QUORUM_MULTISIG_INFO',
  description: 'Provides context about multi-agent wallets and pending proposals',
  
  get: async (runtime: IAgentRuntime, message: Memory, state?: State): Promise<string> => {
    try {
      const agentId = quorumService.getAgentId();
      if (!agentId) {
        return ''; // Not initialized
      }
      
      const multisigs = await quorumService.listMultisigs();
      const proposals = await quorumService.listPendingProposals();
      
      if (multisigs.length === 0 && proposals.length === 0) {
        return ''; // No relevant context
      }
      
      let context = '## Quorum Multi-Agent Wallets\n\n';
      
      if (multisigs.length > 0) {
        context += '### My Wallets\n';
        for (const ms of multisigs) {
          context += `- **${ms.name}**: ${ms.address.slice(0, 12)}... (${ms.threshold}-of-${ms.agents.length} on ${ms.chainId})\n`;
        }
        context += '\n';
      }
      
      if (proposals.length > 0) {
        context += '### ⚠️ Pending Proposals Requiring Signature\n';
        for (const p of proposals) {
          const amount = p.outputs.reduce((sum, o) => sum + parseInt(o.amount), 0);
          context += `- **${amount} sats** to ${p.outputs[0]?.address.slice(0, 12)}... [${p.signatures.length} sigs] - ID: ${p.id.slice(0, 8)}...\n`;
        }
        context += '\nUse "sign proposal <id>" to approve these transactions.\n';
      }
      
      return context;
    } catch (err) {
      console.error('[Quorum Provider] Error:', err);
      return '';
    }
  },
};
