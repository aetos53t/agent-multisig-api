/**
 * Quorum Plugin for Eliza
 * 
 * Enables any Eliza agent to participate in multi-agent wallets via Quorum.
 */

import { quorumService } from './services/quorum.js';
import { createMultisigAction } from './actions/createMultisig.js';
import { joinMultisigAction } from './actions/joinMultisig.js';
import { signProposalAction } from './actions/signProposal.js';
import { listProposalsAction } from './actions/listProposals.js';
import { createProposalAction } from './actions/createProposal.js';
import { multisigProvider } from './providers/multisigInfo.js';

export const quorumPlugin = {
  name: 'quorum',
  description: 'Multi-agent wallet coordination via Quorum',
  
  // Initialize on plugin load
  async init(runtime: any) {
    await quorumService.initialize(runtime);
  },
  
  actions: [
    createMultisigAction,
    joinMultisigAction,
    signProposalAction,
    listProposalsAction,
    createProposalAction,
  ],
  
  providers: [multisigProvider],
};

export default quorumPlugin;

// Re-export for convenience
export { quorumService } from './services/quorum.js';
export * from './actions/createMultisig.js';
export * from './actions/joinMultisig.js';
export * from './actions/signProposal.js';
export * from './actions/listProposals.js';
export * from './actions/createProposal.js';
