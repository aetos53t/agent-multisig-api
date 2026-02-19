"""
Agent Multisig Client

Main client for interacting with the Agent Multisig Coordination API.
"""

import time
from typing import Any, Dict, List, Literal, Optional, TypedDict
from urllib.request import Request, urlopen
from urllib.error import HTTPError
import json


class AgentMultisigError(Exception):
    """Exception raised for API errors."""
    
    def __init__(self, message: str, status_code: Optional[int] = None, code: Optional[str] = None):
        super().__init__(message)
        self.status_code = status_code
        self.code = code


class Agent(TypedDict, total=False):
    id: str
    name: str
    provider: Literal['aibtc', 'agentkit', 'crossmint', 'clawcash', 'bankr', 'custom']
    public_key: str
    chain: Literal['bitcoin', 'stacks', 'evm', 'solana']
    created_at: str


class Multisig(TypedDict, total=False):
    id: str
    name: str
    address: str
    threshold: int
    total_signers: int
    agents: List[str]
    network: Literal['mainnet', 'testnet', 'signet']
    chain: Literal['bitcoin', 'stacks', 'evm', 'solana']
    script_hex: str
    created_at: str


class Proposal(TypedDict, total=False):
    id: str
    multisig_id: str
    type: Literal['spend', 'custom']
    status: Literal['pending', 'ready', 'broadcast', 'confirmed', 'failed']
    to: str
    amount: int
    psbt_hex: str
    signatures: List[Dict[str, Any]]
    txid: str
    created_at: str
    expires_at: str


class AgentMultisig:
    """
    Client for the Agent Multisig Coordination API.
    
    Args:
        api_url: Base URL of the API
        api_key: Optional API key for authentication
        timeout: Request timeout in seconds (default: 30)
    
    Example:
        >>> client = AgentMultisig(
        ...     api_url='https://agent-multisig-api-production.up.railway.app'
        ... )
        >>> health = client.health()
        >>> print(health['status'])
    """
    
    def __init__(
        self,
        api_url: str,
        api_key: Optional[str] = None,
        timeout: int = 30
    ):
        self.api_url = api_url.rstrip('/')
        self.api_key = api_key
        self.timeout = timeout
    
    def _request(
        self,
        method: str,
        path: str,
        body: Optional[Dict[str, Any]] = None
    ) -> Any:
        """Make an HTTP request to the API."""
        url = f"{self.api_url}{path}"
        
        headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        }
        
        if self.api_key:
            headers['Authorization'] = f'Bearer {self.api_key}'
        
        data = json.dumps(body).encode('utf-8') if body else None
        
        request = Request(url, data=data, headers=headers, method=method)
        
        try:
            with urlopen(request, timeout=self.timeout) as response:
                return json.loads(response.read().decode('utf-8'))
        except HTTPError as e:
            try:
                error_body = json.loads(e.read().decode('utf-8'))
                message = error_body.get('error') or error_body.get('message') or str(e)
                code = error_body.get('code')
            except:
                message = str(e)
                code = None
            raise AgentMultisigError(message, e.code, code)
        except Exception as e:
            raise AgentMultisigError(str(e))
    
    # ==================== Health ====================
    
    def health(self) -> Dict[str, str]:
        """Check API health status."""
        return self._request('GET', '/health')
    
    # ==================== Agents ====================
    
    def register_agent(
        self,
        name: str,
        provider: str,
        public_key: str,
        chain: str = 'bitcoin',
        webhook_url: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> Agent:
        """
        Register a new agent with the coordination API.
        
        Args:
            name: Human-readable name for the agent
            provider: Wallet provider ('aibtc', 'agentkit', 'crossmint', 'clawcash', 'bankr', 'custom')
            public_key: Agent's public key (hex-encoded)
            chain: Blockchain ('bitcoin', 'stacks', 'evm', 'solana')
            webhook_url: Optional URL for signature requests
            metadata: Optional extra data
        
        Returns:
            The registered agent object
        """
        body = {
            'name': name,
            'provider': provider,
            'publicKey': public_key,
            'chain': chain,
        }
        if webhook_url:
            body['webhookUrl'] = webhook_url
        if metadata:
            body['metadata'] = metadata
        
        return self._request('POST', '/agents', body)
    
    def get_agent(self, agent_id: str) -> Agent:
        """Get an agent by ID."""
        return self._request('GET', f'/agents/{agent_id}')
    
    def list_agents(self) -> List[Agent]:
        """List all registered agents."""
        return self._request('GET', '/agents')
    
    # ==================== Multisigs ====================
    
    def create_multisig(
        self,
        name: str,
        threshold: int,
        agents: List[str],
        network: str = 'mainnet',
        chain: str = 'bitcoin'
    ) -> Multisig:
        """
        Create a new multisig wallet.
        
        Args:
            name: Human-readable name
            threshold: Number of signatures required (e.g., 2 for 2-of-3)
            agents: List of agent IDs
            network: Bitcoin network ('mainnet', 'testnet', 'signet')
            chain: Blockchain ('bitcoin', 'stacks', 'evm', 'solana')
        
        Returns:
            The created multisig with its address
        
        Example:
            >>> multisig = client.create_multisig(
            ...     name='Treasury',
            ...     threshold=2,
            ...     agents=['agent_abc', 'agent_def', 'agent_ghi']
            ... )
            >>> print(f"Fund: {multisig['address']}")
        """
        return self._request('POST', '/multisigs', {
            'name': name,
            'threshold': threshold,
            'agents': agents,
            'network': network,
            'chain': chain,
        })
    
    def get_multisig(self, multisig_id: str) -> Multisig:
        """Get a multisig by ID."""
        return self._request('GET', f'/multisigs/{multisig_id}')
    
    def list_multisigs(self) -> List[Multisig]:
        """List all multisigs."""
        return self._request('GET', '/multisigs')
    
    def get_multisig_balance(self, multisig_id: str) -> Dict[str, Any]:
        """
        Get the balance of a multisig wallet.
        
        Returns:
            Dict with 'confirmed', 'unconfirmed', and 'utxos'
        """
        return self._request('GET', f'/multisigs/{multisig_id}/balance')
    
    # ==================== Proposals ====================
    
    def create_proposal(
        self,
        multisig_id: str,
        to: str,
        amount: int,
        memo: Optional[str] = None
    ) -> Proposal:
        """
        Create a spend proposal for a multisig.
        
        Args:
            multisig_id: ID of the multisig to spend from
            to: Destination address
            amount: Amount in satoshis
            memo: Optional memo
        
        Returns:
            The created proposal with PSBT to sign
        
        Example:
            >>> proposal = client.create_proposal(
            ...     multisig_id='msig_xyz',
            ...     to='bc1q...',
            ...     amount=10000
            ... )
            >>> print(f"Sign this PSBT: {proposal['psbt_hex']}")
        """
        body = {
            'multisigId': multisig_id,
            'to': to,
            'amount': amount,
        }
        if memo:
            body['memo'] = memo
        
        return self._request('POST', '/proposals', body)
    
    def get_proposal(self, proposal_id: str) -> Proposal:
        """Get a proposal by ID."""
        return self._request('GET', f'/proposals/{proposal_id}')
    
    def list_proposals(self, multisig_id: Optional[str] = None) -> List[Proposal]:
        """List proposals, optionally filtered by multisig."""
        path = f'/proposals?multisigId={multisig_id}' if multisig_id else '/proposals'
        return self._request('GET', path)
    
    def sign_proposal(
        self,
        proposal_id: str,
        agent_id: str,
        signature: str
    ) -> Proposal:
        """
        Sign a proposal with an agent's key.
        
        Args:
            proposal_id: ID of the proposal
            agent_id: ID of the signing agent
            signature: Schnorr signature (hex-encoded)
        
        Returns:
            Updated proposal with the new signature
        """
        return self._request('POST', f'/proposals/{proposal_id}/sign', {
            'agentId': agent_id,
            'signature': signature,
        })
    
    def broadcast_proposal(self, proposal_id: str) -> Dict[str, str]:
        """
        Broadcast a fully-signed proposal.
        
        Returns:
            Dict with 'txid' of the broadcast transaction
        """
        return self._request('POST', f'/proposals/{proposal_id}/broadcast')
    
    # ==================== Convenience Methods ====================
    
    def quick_setup(
        self,
        name: str,
        threshold: int,
        signers: List[Dict[str, str]],
        network: str = 'mainnet'
    ) -> Dict[str, Any]:
        """
        Create a multisig and register agents in one call.
        
        Args:
            name: Name for the multisig
            threshold: Signature threshold
            signers: List of dicts with 'name', 'provider', 'public_key'
            network: Bitcoin network
        
        Returns:
            Dict with 'multisig' and 'agents'
        
        Example:
            >>> result = client.quick_setup(
            ...     name='Treasury',
            ...     threshold=2,
            ...     signers=[
            ...         {'name': 'Bot1', 'provider': 'aibtc', 'public_key': '...'},
            ...         {'name': 'Bot2', 'provider': 'aibtc', 'public_key': '...'},
            ...         {'name': 'Bot3', 'provider': 'aibtc', 'public_key': '...'},
            ...     ]
            ... )
            >>> print(result['multisig']['address'])
        """
        agents = []
        for signer in signers:
            agent = self.register_agent(
                name=signer['name'],
                provider=signer['provider'],
                public_key=signer['public_key'],
                chain=signer.get('chain', 'bitcoin')
            )
            agents.append(agent)
        
        multisig = self.create_multisig(
            name=name,
            threshold=threshold,
            agents=[a['id'] for a in agents],
            network=network
        )
        
        return {'multisig': multisig, 'agents': agents}
    
    def wait_for_proposal(
        self,
        proposal_id: str,
        target_status: str,
        timeout_ms: int = 300000,
        poll_interval_ms: int = 5000
    ) -> Proposal:
        """
        Wait for a proposal to reach a target status.
        
        Args:
            proposal_id: ID of the proposal
            target_status: Status to wait for ('ready', 'broadcast', 'confirmed')
            timeout_ms: Maximum wait time in milliseconds
            poll_interval_ms: Polling interval in milliseconds
        
        Returns:
            The proposal once it reaches the target status
        
        Raises:
            AgentMultisigError: If timeout or proposal fails
        """
        start = time.time() * 1000
        
        while (time.time() * 1000 - start) < timeout_ms:
            proposal = self.get_proposal(proposal_id)
            
            if proposal.get('status') == target_status:
                return proposal
            
            if proposal.get('status') == 'failed':
                raise AgentMultisigError('Proposal failed', 400, 'PROPOSAL_FAILED')
            
            time.sleep(poll_interval_ms / 1000)
        
        raise AgentMultisigError(
            f'Timeout waiting for proposal to reach {target_status}',
            408,
            'TIMEOUT'
        )
