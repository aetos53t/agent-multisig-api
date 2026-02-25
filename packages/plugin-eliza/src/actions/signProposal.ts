import { Action, IAgentRuntime, Memory, State, HandlerCallback } from '@elizaos/core';
import { quorumService } from '../services/quorum.js';

export const signProposalAction: Action = {
  name: 'QUORUM_SIGN_PROPOSAL',
  description: 'Sign a pending proposal in a multi-agent wallet',
  
  similes: [
    'sign proposal',
    'approve transaction',
    'sign tx',
    'approve proposal',
    'co-sign',
  ],
  
  examples: [
    [
      { user: '{{user1}}', content: { text: 'Sign proposal abc123' } },
      { user: '{{agent}}', content: { text: 'Signed! 2/3 signatures collected. Waiting for one more signer.' } },
    ],
  ],
  
  validate: async (runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    const text = message.content?.text?.toLowerCase() || '';
    return (text.includes('sign') || text.includes('approve')) && 
           (text.includes('proposal') || text.includes('transaction') || text.includes('tx'));
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
      
      // Extract proposal ID (UUID format)
      const idMatch = text.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i) ||
                      text.match(/proposal\s+([a-f0-9-]+)/i);
      
      if (!idMatch) {
        // Try to find pending proposals
        const pending = await quorumService.listPendingProposals();
        if (pending.length === 0) {
          callback?.({ text: '❌ No pending proposals found. Provide a proposal ID or create a new proposal.' });
          return false;
        }
        
        if (pending.length === 1) {
          // Auto-sign the only pending proposal
          const result = await quorumService.signProposal(pending[0].id);
          
          if (result.txid) {
            callback?.({ text: `✅ Signed and broadcast! txid: ${result.txid}\n\nhttps://mempool.space/tx/${result.txid}` });
          } else {
            callback?.({ text: `✅ Signed! Proposal status: ${result.status}. Waiting for more signatures.` });
          }
          return true;
        }
        
        // List pending proposals
        const list = pending.map(p => 
          `- \`${p.id.slice(0,8)}...\`: ${p.outputs.map(o => `${o.amount} sats`).join(', ')} (${p.signatures.length} sigs)`
        ).join('\n');
        
        callback?.({ text: `Multiple pending proposals. Please specify which one:\n\n${list}` });
        return false;
      }
      
      const proposalId = idMatch[1];
      const result = await quorumService.signProposal(proposalId);
      
      if (result.txid) {
        callback?.({ 
          text: `✅ **Threshold met! Transaction broadcast.**\n\n**txid:** \`${result.txid}\`\n\nhttps://mempool.space/tx/${result.txid}` 
        });
      } else {
        const proposal = await quorumService.getProposal(proposalId);
        callback?.({ 
          text: `✅ Signed! ${proposal.signatures.length}/${proposal.sighashes.length + 1} signatures collected. Waiting for more signers.` 
        });
      }
      
      return true;
    } catch (err: any) {
      callback?.({ text: `❌ Failed to sign: ${err.message}` });
      return false;
    }
  },
};
