import { Action, IAgentRuntime, Memory, State, HandlerCallback } from '@elizaos/core';
import { quorumService } from '../services/quorum.js';

export const createMultisigAction: Action = {
  name: 'QUORUM_CREATE_MULTISIG',
  description: 'Create a new multi-agent wallet via Quorum',
  
  similes: [
    'create multisig',
    'create multi-agent wallet',
    'setup shared wallet',
    'create treasury',
    'create quorum wallet',
  ],
  
  examples: [
    [
      { user: '{{user1}}', content: { text: 'Create a 2-of-3 Bitcoin multisig called "Team Treasury"' } },
      { user: '{{agent}}', content: { text: 'Created multisig "Team Treasury" (2-of-3). Invite code: abc123. Share this with other signers to join.' } },
    ],
  ],
  
  validate: async (runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    const text = message.content?.text?.toLowerCase() || '';
    return text.includes('create') && (text.includes('multisig') || text.includes('wallet') || text.includes('treasury'));
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
      
      // Parse parameters from message
      const thresholdMatch = text.match(/(\d+)[- ]of[- ](\d+)/i);
      const threshold = thresholdMatch ? parseInt(thresholdMatch[1]) : 2;
      const totalSigners = thresholdMatch ? parseInt(thresholdMatch[2]) : 3;
      
      const nameMatch = text.match(/(?:called|named)\s+["']?([^"']+)["']?/i);
      const name = nameMatch ? nameMatch[1].trim() : `Multisig ${Date.now()}`;
      
      // Detect chain
      let chainId = 'bitcoin-mainnet';
      if (text.includes('ethereum') || text.includes('eth')) chainId = 'ethereum';
      if (text.includes('solana') || text.includes('sol')) chainId = 'solana-mainnet';
      if (text.includes('base')) chainId = 'base';
      if (text.includes('stacks') || text.includes('stx')) chainId = 'stacks-mainnet';
      
      const result = await quorumService.createMultisig({
        name,
        chainId,
        threshold,
        totalSigners,
      });
      
      const response = `✅ Created multisig "${name}" (${threshold}-of-${totalSigners} on ${chainId})

**Invite Code:** \`${result.inviteCode}\`
**Join Link:** https://quorumclaw.com/join/${result.inviteCode}

Share this with other signers to join the wallet.`;
      
      callback?.({ text: response });
      return true;
    } catch (err: any) {
      callback?.({ text: `❌ Failed to create multisig: ${err.message}` });
      return false;
    }
  },
};
