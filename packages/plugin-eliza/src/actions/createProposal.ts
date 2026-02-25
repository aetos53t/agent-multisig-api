
import { quorumService } from '../services/quorum.js';

export const createProposalAction = {
  name: 'QUORUM_CREATE_PROPOSAL',
  description: 'Create a new spending proposal in a multi-agent wallet',
  
  similes: [
    'send from multisig',
    'create proposal',
    'propose spend',
    'propose transaction',
    'send from treasury',
  ],
  
  examples: [
    [
      { user: '{{user1}}', content: { text: 'Send 5000 sats to bc1q... from our treasury' } },
      { user: '{{agent}}', content: { text: 'Created proposal! ID: abc123. Waiting for 2 more signatures.' } },
    ],
  ],
  
  validate: async (runtime: any, message: any): Promise<any> => {
    const text = message.content?.text?.toLowerCase() || '';
    return (text.includes('send') || text.includes('propose') || text.includes('transfer')) && 
           (text.includes('multisig') || text.includes('treasury') || text.includes('proposal') || text.includes('sats'));
  },
  
  handler: async (
    runtime: any,
    message: any,
    state: any,
    options: Record<string, unknown>,
    callback?: any
  ): Promise<any> => {
    try {
      const text = message.content?.text || '';
      
      // Parse amount
      const amountMatch = text.match(/(\d+(?:,\d+)?)\s*(?:sats?|satoshis?)/i);
      if (!amountMatch) {
        callback?.({ text: '❌ Please specify an amount in sats. Example: "Send 5000 sats to bc1q..."' });
        return false;
      }
      const amount = parseInt(amountMatch[1].replace(/,/g, ''));
      
      // Parse recipient address
      const addressMatch = text.match(/(bc1[a-z0-9]{39,87})/i) || // Bech32
                          text.match(/(tb1[a-z0-9]{39,87})/i) || // Testnet
                          text.match(/(0x[a-fA-F0-9]{40})/i);    // EVM
      
      if (!addressMatch) {
        callback?.({ text: '❌ Please provide a recipient address. Example: "Send 5000 sats to bc1q..."' });
        return false;
      }
      const recipient = addressMatch[1];
      
      // Get multisigs
      const multisigs = await quorumService.listMultisigs();
      if (multisigs.length === 0) {
        callback?.({ text: '❌ You are not part of any multisigs. Create or join one first.' });
        return false;
      }
      
      // Use first multisig or parse from message
      // TODO: Allow specifying which multisig
      const multisig = multisigs[0];
      
      // Parse note
      const noteMatch = text.match(/(?:note|memo|for|reason)[:\s]+["']?([^"']+)["']?/i);
      const note = noteMatch ? noteMatch[1].trim() : undefined;
      
      const proposal = await quorumService.createProposal({
        multisigId: multisig.id,
        recipient,
        amount,
        note,
      });
      
      callback?.({ 
        text: `✅ **Proposal Created**

**ID:** \`${proposal.id}\`
**Amount:** ${amount.toLocaleString()} sats
**To:** ${recipient}
**From:** ${multisig.name}

Proposal needs ${multisig.threshold} signatures. Share the proposal ID with other signers.

https://quorumclaw.com/p/${proposal.id}` 
      });
      
      return true;
    } catch (err: any) {
      callback?.({ text: `❌ Failed to create proposal: ${err.message}` });
      return false;
    }
  },
};
