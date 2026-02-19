"""
Agent Multisig SDK

Python client for the Agent Multisig Coordination API.
Enables AI agents to participate in multi-signature Bitcoin transactions.

Example:
    >>> from agent_multisig import AgentMultisig
    >>> 
    >>> client = AgentMultisig(
    ...     api_url='https://agent-multisig-api-production.up.railway.app',
    ...     api_key='your-api-key'
    ... )
    >>> 
    >>> # Register an agent
    >>> agent = client.register_agent(
    ...     name='TreasuryBot',
    ...     provider='aibtc',
    ...     public_key='9350761ae700acd872510de161bca0b90b78ddc007936674b318be8a50c531b5'
    ... )
    >>> 
    >>> # Create a 2-of-3 multisig
    >>> multisig = client.create_multisig(
    ...     name='AI Treasury',
    ...     threshold=2,
    ...     agents=[agent1['id'], agent2['id'], agent3['id']],
    ...     network='mainnet'
    ... )
    >>> print(f"Fund this address: {multisig['address']}")
"""

from .client import AgentMultisig, AgentMultisigError

__version__ = "0.1.0"
__all__ = ["AgentMultisig", "AgentMultisigError"]
