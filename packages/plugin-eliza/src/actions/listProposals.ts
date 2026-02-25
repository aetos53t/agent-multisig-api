import { Action, IAgentRuntime, Memory, State, HandlerCallback } from '@elizaos/core';
import { quorumService } from '../services/quorum.js';

export const listProposalsAction: Action = {
  name: 'QUORUM_LIST_PROPOSALS',
  description: 'List pending proposals across all multi-agent wallets',
  
  similes: [
    'list proposals',
    'show proposals',
    'pending transactions',
    'what needs signing',
    'check proposals',
  ],
  
  examples: [
    [
      { user: '{{user1}}', content: { text: 'Show pending proposals' } },
      { user: '{{agent}}', content: { text: 'You have 2 pending proposals:\n- 5000 sats to bc1q... (1/2 sigs)\n- 10000 sats to bc1p... (0/3 sigs)' } },
    ],
  ],
  
  validate: async (runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    const text = message.content?.text?.toLowerCase() || '';
    return (text.includes('list') || text.includes('show') || text.includes('pending') || text.includes('check')) && 
           (text.includes('proposal') || text.includes('transaction') || text.includes('signing'));
  },
  
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State,
    options: Record<string, unknown>,
    callback?: HandlerCallback
  ): Promise<boolean> => {
    try {
      const proposals = await quorumService.listPendingProposals();
      
      if (proposals.length === 0) {
        callback?.({ text: '✅ No pending proposals. All caught up!' });
        return true;
      }
      
      const list = proposals.map(p => {
        const amount = p.outputs.reduce((sum, o) => sum + parseInt(o.amount), 0);
        const recipient = p.outputs[0]?.address || 'unknown';
        const shortRecipient = `${recipient.slice(0, 8)}...${recipient.slice(-6)}`;
        return `• **${amount.toLocaleString()} sats** → ${shortRecipient}
  ID: \`${p.id.slice(0, 8)}...\` | Sigs: ${p.signatures.length}/? | ${p.note || 'No note'}`;
      }).join('\n\n');
      
      callback?.({ 
        text: `📋 **Pending Proposals (${proposals.length})**\n\n${list}\n\nSay "sign proposal <id>" to approve.` 
      });
      
      return true;
    } catch (err: any) {
      callback?.({ text: `❌ Failed to list proposals: ${err.message}` });
      return false;
    }
  },
};
