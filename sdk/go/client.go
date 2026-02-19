// Package multisig provides a Go client for the Agent Multisig Coordination API.
package multisig

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// Client is the main API client.
type Client struct {
	baseURL    string
	apiKey     string
	httpClient *http.Client
}

// NewClient creates a new API client.
func NewClient(baseURL, apiKey string) *Client {
	return &Client{
		baseURL: baseURL,
		apiKey:  apiKey,
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

// Agent represents a registered agent.
type Agent struct {
	ID        string            `json:"id"`
	Name      string            `json:"name"`
	Provider  string            `json:"provider"`
	PublicKey string            `json:"publicKey"`
	Chain     string            `json:"chain"`
	CreatedAt string            `json:"createdAt"`
	Metadata  map[string]any    `json:"metadata,omitempty"`
}

// Multisig represents a multisig wallet.
type Multisig struct {
	ID           string   `json:"id"`
	Name         string   `json:"name"`
	Address      string   `json:"address"`
	Threshold    int      `json:"threshold"`
	TotalSigners int      `json:"totalSigners"`
	Agents       []string `json:"agents"`
	Network      string   `json:"network"`
	Chain        string   `json:"chain"`
	CreatedAt    string   `json:"createdAt"`
	Balance      *Balance `json:"balance,omitempty"`
}

// Balance represents wallet balance.
type Balance struct {
	Confirmed   string `json:"confirmed"`
	Unconfirmed string `json:"unconfirmed"`
	Total       string `json:"total"`
}

// Proposal represents a spend proposal.
type Proposal struct {
	ID          string      `json:"id"`
	MultisigID  string      `json:"multisigId"`
	Status      string      `json:"status"`
	Outputs     []TxOutput  `json:"outputs"`
	Fee         string      `json:"fee,omitempty"`
	PSBTHex     string      `json:"psbtHex,omitempty"`
	Signatures  []Signature `json:"signatures"`
	Txid        string      `json:"txid,omitempty"`
	CreatedAt   string      `json:"createdAt"`
	ExpiresAt   string      `json:"expiresAt,omitempty"`
	Sighashes   []Sighash   `json:"sighashes,omitempty"`
}

// TxOutput represents a transaction output.
type TxOutput struct {
	Address string `json:"address"`
	Amount  string `json:"amount"`
}

// Signature represents a collected signature.
type Signature struct {
	AgentID   string `json:"agentId"`
	Signature string `json:"signature"`
	SignedAt  string `json:"signedAt"`
}

// Sighash represents a signing digest.
type Sighash struct {
	InputIndex int    `json:"inputIndex"`
	Sighash    string `json:"sighash"`
	LeafHash   string `json:"leafHash"`
}

// RegisterAgentInput is the input for RegisterAgent.
type RegisterAgentInput struct {
	Name       string         `json:"name"`
	Provider   string         `json:"provider"`
	PublicKey  string         `json:"publicKey"`
	Chain      string         `json:"chain,omitempty"`
	WebhookURL string         `json:"webhookUrl,omitempty"`
	Metadata   map[string]any `json:"metadata,omitempty"`
}

// CreateMultisigInput is the input for CreateMultisig.
type CreateMultisigInput struct {
	Name      string   `json:"name"`
	Threshold int      `json:"threshold"`
	Agents    []string `json:"agents"`
	Network   string   `json:"network,omitempty"`
	Chain     string   `json:"chain,omitempty"`
}

// CreateProposalInput is the input for CreateProposal.
type CreateProposalInput struct {
	MultisigID string     `json:"multisigId"`
	Outputs    []TxOutput `json:"outputs"`
	Memo       string     `json:"memo,omitempty"`
}

// SignProposalInput is the input for SignProposal.
type SignProposalInput struct {
	ProposalID string `json:"-"`
	AgentID    string `json:"agentId"`
	Signature  string `json:"signature"`
}

// SignResult is the result of SignProposal.
type SignResult struct {
	ProposalID      string   `json:"proposalId"`
	Status          string   `json:"status"`
	SignatureCount  int      `json:"signatureCount"`
	Threshold       int      `json:"threshold"`
	ThresholdMet    bool     `json:"thresholdMet"`
	RemainingSigners []string `json:"remainingSigners"`
}

// BroadcastResult is the result of BroadcastProposal.
type BroadcastResult struct {
	ProposalID  string `json:"proposalId"`
	Status      string `json:"status"`
	Txid        string `json:"txid"`
	ExplorerURL string `json:"explorerUrl"`
}

// APIResponse wraps all API responses.
type APIResponse struct {
	Success bool            `json:"success"`
	Data    json.RawMessage `json:"data,omitempty"`
	Error   *APIError       `json:"error,omitempty"`
}

// APIError represents an API error.
type APIError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

func (e *APIError) Error() string {
	return fmt.Sprintf("%s: %s", e.Code, e.Message)
}

func (c *Client) request(method, path string, body any, result any) error {
	url := c.baseURL + "/v1" + path
	if path == "/health" {
		url = c.baseURL + path
	}

	var bodyReader io.Reader
	if body != nil {
		jsonBody, err := json.Marshal(body)
		if err != nil {
			return err
		}
		bodyReader = bytes.NewReader(jsonBody)
	}

	req, err := http.NewRequest(method, url, bodyReader)
	if err != nil {
		return err
	}

	req.Header.Set("Content-Type", "application/json")
	if c.apiKey != "" {
		req.Header.Set("Authorization", "Bearer "+c.apiKey)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return err
	}

	var apiResp APIResponse
	if err := json.Unmarshal(respBody, &apiResp); err != nil {
		return err
	}

	if !apiResp.Success {
		if apiResp.Error != nil {
			return apiResp.Error
		}
		return fmt.Errorf("API request failed")
	}

	if result != nil && apiResp.Data != nil {
		return json.Unmarshal(apiResp.Data, result)
	}

	return nil
}

// Health checks API health.
func (c *Client) Health() (map[string]any, error) {
	var result map[string]any
	err := c.request("GET", "/health", nil, &result)
	return result, err
}

// RegisterAgent registers a new agent.
func (c *Client) RegisterAgent(input RegisterAgentInput) (*Agent, error) {
	var result Agent
	err := c.request("POST", "/agents", input, &result)
	return &result, err
}

// GetAgent gets an agent by ID.
func (c *Client) GetAgent(agentID string) (*Agent, error) {
	var result Agent
	err := c.request("GET", "/agents/"+agentID, nil, &result)
	return &result, err
}

// ListAgents lists all agents.
func (c *Client) ListAgents() ([]Agent, error) {
	var result []Agent
	err := c.request("GET", "/agents", nil, &result)
	return result, err
}

// CreateMultisig creates a new multisig wallet.
func (c *Client) CreateMultisig(input CreateMultisigInput) (*Multisig, error) {
	var result Multisig
	err := c.request("POST", "/multisigs", input, &result)
	return &result, err
}

// GetMultisig gets a multisig by ID.
func (c *Client) GetMultisig(multisigID string) (*Multisig, error) {
	var result Multisig
	err := c.request("GET", "/multisigs/"+multisigID, nil, &result)
	return &result, err
}

// ListMultisigs lists all multisigs.
func (c *Client) ListMultisigs() ([]Multisig, error) {
	var result []Multisig
	err := c.request("GET", "/multisigs", nil, &result)
	return result, err
}

// CreateProposal creates a spend proposal.
func (c *Client) CreateProposal(input CreateProposalInput) (*Proposal, error) {
	var result Proposal
	err := c.request("POST", "/proposals", input, &result)
	return &result, err
}

// GetProposal gets a proposal by ID.
func (c *Client) GetProposal(proposalID string) (*Proposal, error) {
	var result Proposal
	err := c.request("GET", "/proposals/"+proposalID, nil, &result)
	return &result, err
}

// SignProposal signs a proposal.
func (c *Client) SignProposal(input SignProposalInput) (*SignResult, error) {
	var result SignResult
	err := c.request("POST", "/proposals/"+input.ProposalID+"/sign", input, &result)
	return &result, err
}

// BroadcastProposal broadcasts a fully-signed proposal.
func (c *Client) BroadcastProposal(proposalID string) (*BroadcastResult, error) {
	var result BroadcastResult
	err := c.request("POST", "/proposals/"+proposalID+"/broadcast", nil, &result)
	return &result, err
}
