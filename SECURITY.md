# Security Policy

## Security Model

Agent Multisig Coordination API is designed with security as a primary concern.

### What We Never Do

1. **Never store private keys** - Private keys remain with agents. We only see public keys.
2. **Never generate keys for agents** - Agents bring their own keys.
3. **Never sign transactions** - Agents sign; we coordinate.
4. **Never hold funds** - Multisig addresses are controlled by agents, not us.

### Defense in Depth

```
┌─────────────────────────────────────────────────────────────────┐
│                        AGENT LAYER                               │
│  Agents keep private keys. Sign digests locally. Submit sigs.   │
└───────────────────────────────┬─────────────────────────────────┘
                                │
┌───────────────────────────────▼─────────────────────────────────┐
│                     COORDINATION LAYER (this API)                │
│  - Creates unsigned transactions (PSBTs)                         │
│  - Computes sighashes for agents to sign                         │
│  - Collects signatures                                           │
│  - Validates signatures match registered pubkeys                 │
│  - Finalizes transactions when threshold met                     │
│  - Broadcasts to network                                         │
└───────────────────────────────┬─────────────────────────────────┘
                                │
┌───────────────────────────────▼─────────────────────────────────┐
│                       BLOCKCHAIN LAYER                           │
│  Bitcoin, EVM, Stacks - native multisig verification            │
└─────────────────────────────────────────────────────────────────┘
```

### Threat Mitigations

| Threat | Mitigation |
|--------|------------|
| API compromise | Attacker cannot sign - no private keys |
| Malicious API | Agents verify sighash before signing |
| MITM attack | HTTPS + signature verification |
| Replay attack | Unique sighashes per transaction |
| Key extraction | Keys never leave agent control |
| Insider threat | No privileged access to funds |

### PSBT Security

We use PSBTs (BIP-174) for Bitcoin transactions:

1. **Full visibility** - Agents can decode PSBT to see all inputs/outputs
2. **Partial signing** - Each agent signs only their part
3. **Validation** - Agents should verify:
   - Input amounts match expected
   - Output addresses are correct
   - Fee is reasonable

### Taproot Multisig Security

Our Bitcoin multisigs use Taproot (P2TR) with script-path spending:

- **Privacy** - Script not revealed until spending
- **Schnorr signatures** - BIP-340 compliant
- **No key aggregation** - Each key signs independently (safer)

### EVM Safe Security

For EVM chains, we use Safe (formerly Gnosis Safe):

- **Battle-tested** - Secures $100B+ in assets
- **EIP-712 signatures** - Human-readable signing
- **Deterministic addresses** - CREATE2 deployment
- **No proxy pattern** - Direct contract interaction

## Reporting Vulnerabilities

**DO NOT** open public issues for security vulnerabilities.

Email: security@agentmultisig.dev (not yet active)

Or DM [@AetosSET](https://twitter.com/AetosSET) on Twitter.

### What to Include

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

### Response Timeline

- **24 hours** - Acknowledgment
- **72 hours** - Initial assessment
- **7 days** - Fix deployed (if critical)
- **30 days** - Public disclosure (coordinated)

## Security Checklist for Integrators

Before going to production:

- [ ] Verify you're connecting to the correct API endpoint
- [ ] Validate sighashes before signing
- [ ] Check output addresses match expected destinations
- [ ] Review fee amounts are reasonable
- [ ] Test with small amounts first
- [ ] Monitor your multisig addresses for unexpected activity
- [ ] Keep agent private keys secure (HSM recommended for production)
- [ ] Implement webhook signature verification (coming soon)
- [ ] Set up alerts for proposal creation

## Audit Status

**Not yet audited.**

This is pre-production software. Use at your own risk.

We plan to pursue a security audit before v1.0 release.

## Known Limitations

1. **In-memory storage** - Default mode doesn't persist across restarts
2. **No HSM support** - Agents must manage their own key security
3. **Rate limiting** - Basic implementation, not production-hardened
4. **No MFA** - API keys are single-factor

## Bug Bounty

No formal bug bounty program yet.

Significant vulnerabilities may be rewarded at our discretion.
