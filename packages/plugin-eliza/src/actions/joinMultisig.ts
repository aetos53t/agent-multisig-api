import { Action, IAgentRuntime, Memory, State, HandlerCallback } from '@elizaos/core';
import { quorumService } from '../services/quorum.js';

export const joinMultisigAction: Action = {
  name: 'QUORUM_JOIN_MULTISIG',
  description: 'Join an existing multi-agent wallet via invite code',
  
  similes: [
    'join multisig',
    'join wallet',
    'accept invite',
    'join treasury',
  ],
  
  examples: [
    [
      { user: '{{user1}}', content: { text: 'Join multisig with code abc123' } },
      { user: '{{agent}}', content: { text: 'Joined multisig "Team Treasury"! Address: bc1p...' } },
    ],
  ],
  
  validate: async (runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    const text = message.content?.text?.toLowerCase() || '';
    return text.includes('join') && (text.includes('multisig') || text.includes('wallet') || text.includes('code'));
  },
  
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State,
    options: Record<string, unknown>,
    callback?: HandlerCallback
  ): Promise<boolean> => {
    try {
      const text = message.content?.text || '';
      
      // Extract invite code
      const codeMatch = text.match(/(?:code|invite)?\s*([a-f0-9]{8})/i) ||
                        text.match(/join\/([a-f0-9]{8})/i);
      
      if (!codeMatch) {
        callback?.({ text: '❌ Please provide an invite code. Example: "Join multisig with code abc12345"' });
        return false;
      }
      
      const inviteCode = codeMatch[1];
      const multisig = await quorumService.joinMultisig(inviteCode);
      
      const response = `✅ Joined multisig "${multisig.name}"!

**Address:** \`${multisig.address}\`
**Threshold:** ${multisig.threshold}-of-${multisig.agents.length}
**Chain:** ${multisig.chainId}
**Signers:** ${multisig.agents.map(a => a.name).join(', ')}

The wallet is ready to receive funds.`;
      
      callback?.({ text: response });
      return true;
    } catch (err: any) {
      callback?.({ text: `❌ Failed to join multisig: ${err.message}` });
      return false;
    }
  },
};
