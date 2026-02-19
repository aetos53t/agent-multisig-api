/**
 * Wallet Adapter Registry
 * 
 * Exports all adapters and the registry for looking them up.
 */

// Core adapters
export * from './base';
export * from './aibtc';
export * from './agentkit';
export * from './crossmint';
export * from './clawcash';
export * from './evm-safe';
export * from './bankr';

// Chain-specific adapters (scaffolds)
export * from './stacks';
export * from './solana-squads';

import { adapterRegistry } from './base';
import { AIBTCAdapter } from './aibtc';
import { AgentKitAdapter } from './agentkit';
import { CrossmintAdapter } from './crossmint';
import { ClawCashAdapter } from './clawcash';

// Register all adapters
adapterRegistry.register(new AIBTCAdapter());
adapterRegistry.register(new AgentKitAdapter());
adapterRegistry.register(new CrossmintAdapter());
adapterRegistry.register(new ClawCashAdapter());

// Note: Stacks and Solana adapters are scaffolds, not registered yet
// They require external SDKs to be fully functional

export { adapterRegistry };
