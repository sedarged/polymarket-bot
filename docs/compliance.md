# Compliance & Legal Guidelines

**Version:** 1.0  
**Last Updated:** 2026-02-08  
**Status:** Mandatory Reading - Review Before Operating

---

## ⚠️ CRITICAL: Read This Before Using This Software

**This software is provided for EDUCATIONAL and RESEARCH purposes only.** By using this trading bot, you accept full responsibility for compliance with all applicable laws, regulations, and terms of service.

### Risk Disclaimers

**FINANCIAL RISK:**
- Trading prediction markets involves substantial financial risk
- You can lose your entire investment
- Past performance does not indicate future results
- Automated trading can amplify losses rapidly
- No warranty or guarantee of profitability is provided

**SOFTWARE RISK:**
- This software is provided "AS IS" without warranty of any kind
- See [REPORTS/AUDIT.md](../REPORTS/AUDIT.md) for known security vulnerabilities
- 27 security and reliability findings identified in audit
- 3 CRITICAL issues must be addressed before live trading
- See LICENSE file for complete warranty disclaimer

**LEGAL RISK:**
- You are solely responsible for legal compliance in your jurisdiction
- Prediction market regulations vary by country and change frequently
- Some jurisdictions prohibit prediction market trading
- Violation of applicable laws may result in civil or criminal penalties

---

## Geographic Restrictions

### Prohibited Jurisdictions

**Trading on Polymarket is PROHIBITED for residents of or persons located in:**

1. **United States of America** - All states, territories, and possessions
2. **Sanctioned Countries** (as per U.S. Treasury OFAC):
   - Cuba
   - Iran
   - North Korea
   - Syria
   - Russia (various targeted sanctions)
   - Belarus (various targeted sanctions)
   - Crimea region of Ukraine
   - Donetsk and Luhansk regions of Ukraine

3. **Other Restricted Jurisdictions:**
   - Any jurisdiction where prediction market trading is illegal
   - Any jurisdiction where you would violate local law by trading

**This software does NOT include geo-blocking or VPN detection.**

You are responsible for:
- Determining whether trading is legal in your jurisdiction
- Complying with all local laws and regulations
- Not using VPNs, proxies, or other tools to circumvent restrictions
- Ceasing all trading activities if you relocate to a restricted jurisdiction

**Reference:** See Polymarket [Terms of Service](https://polymarket.com/tos) Section 2.2 "Eligibility"

### Compliance Implementation in Code

**This bot implements a "paper trading by default" safety model:**

```env
# Default configuration (SAFE - paper trading only)
LIVE_TRADING=false
COMPLIANCE_ACCEPTED=false
```

**Live trading requires BOTH environment variables:**
1. `LIVE_TRADING=true` - Explicitly enable live trading
2. `COMPLIANCE_ACCEPTED=true` - Acknowledge legal responsibility

**Code Reference:**
- [apps/backend/src/utils/liveTrading.ts](../apps/backend/src/utils/liveTrading.ts) - Trading gate implementation
- [apps/backend/tests/unit/gating.test.ts](../apps/backend/tests/unit/gating.test.ts) - Compliance gate tests

If either variable is false or unset, the bot will:
- Execute all trades in paper trading mode only
- NOT submit orders to the Polymarket CLOB
- Simulate order execution with realistic fills and slippage

### Before going live (Research §10)

- **Paper trade 7+ days** before enabling live trading.
- **Start with micro capital** ($5–20 USDC) for the first 30 days of live trading.

See [Pre-deployment verification](./pre-deployment-verification.md) for the full checklist.

---

## Terms of Service Compliance

### Official Polymarket Terms

**You MUST read and comply with:**
- **Terms of Service:** https://polymarket.com/tos
- **Privacy Policy:** https://polymarket.com/privacy
- **Risk Disclosure:** https://polymarket.com/risk

### Key Terms to Note

**From Polymarket ToS (current as of 2026-02-08):**

1. **Account Requirements (Section 3):**
   - Must be 18 years or older (or age of majority in your jurisdiction)
   - One account per person
   - Accurate information required for Know Your Customer (KYC)
   - No account sharing or transfers

2. **Prohibited Activities (Section 5):**
   - Market manipulation
   - Wash trading or self-trading
   - Using multiple accounts to circumvent position limits
   - Automated trading that disrupts market operations
   - Front-running or insider trading based on privileged information

3. **API Usage:**
   - Rate limits must be respected (see [Rate Limits](#rate-limits) below)
   - API abuse may result in account suspension
   - No scraping or unauthorized data collection

4. **Account Termination:**
   - Polymarket reserves the right to suspend or terminate accounts
   - Suspected ToS violations may result in immediate termination
   - Funds may be held pending investigation

**⚠️ IMPORTANT:** Polymarket Terms of Service may change. Check the official website regularly for updates.

### Rate Limits

**From official Polymarket API documentation:**
- https://docs.polymarket.com/quickstart/introduction/rate-limits

**Current Rate Limits:**
- **CLOB API:** 10 requests per second per IP address
- **Gamma API:** 10 requests per second per IP address
- **WebSocket:** 1 connection per account (enforced server-side)

**Bot Configuration:**
- Incoming HTTP requests to this backend are rate limited at the server level (see [apps/backend/src/server/index.ts](../apps/backend/src/server/index.ts))
- Outbound requests to Polymarket APIs: retry logic with exponential backoff (see [apps/backend/src/utils/retry.ts](../apps/backend/src/utils/retry.ts))
- No explicit client-side rate limiting for outbound Polymarket API calls beyond API-side enforcement

**Risk (outbound Polymarket API calls):** Exceeding rate limits may result in temporary or permanent API key suspension.

**Recommendation:** Implement explicit client-side rate limiting for outbound Polymarket API calls before production use (Audit Finding A-008).

---

## Automated Trading Regulations

### General Principles

**Automated trading may be subject to additional regulations:**

1. **Market Manipulation Rules:**
   - Do not place orders with intent to manipulate prices
   - Do not engage in quote stuffing or layering strategies
   - Do not coordinate with other traders to manipulate markets

2. **Fair Access:**
   - Do not use techniques that unfairly disadvantage other traders
   - Respect market maker obligations if applicable
   - Disclose automated trading if required by platform

3. **System Safeguards:**
   - Implement risk controls (position limits, loss limits)
   - Use kill switches for emergency situations
   - Monitor for errant behavior and halt if detected

**This bot implements:**
- ✅ Kill switch functionality (all scopes: market, risk-only, all)
- ✅ Paper trading mode for safe testing
- ✅ Kill switch persistence implemented (Audit Finding A-002 - previously CRITICAL, now resolved; state persisted to `.state/kill-switch.json`)
- ⚠️ No position or loss limits (Gap Analysis - needed for production)

### Algorithm Registration

**Some jurisdictions require registration of automated trading algorithms.**

**Note:** Polymarket does not currently require algorithm registration, but this may change.

**Action Required:**
- Monitor regulatory developments in your jurisdiction
- Consult with legal counsel if operating at scale
- Be prepared to provide algorithm documentation if requested

---

## Anti-Money Laundering (AML) & Know Your Customer (KYC)

### Polymarket Requirements

**Polymarket implements AML/KYC procedures:**
- Identity verification required for trading
- Source of funds may be verified for large deposits
- Suspicious activity may be reported to authorities

**Your Responsibilities:**
- Provide accurate identity information
- Comply with all KYC requests promptly
- Do not use the platform to launder money or finance illegal activities
- Report suspicious activity to Polymarket

### Transaction Monitoring

**Trading bots may trigger automated monitoring:**
- High-frequency trading patterns
- Large position sizes relative to account size
- Unusual trading times or patterns
- Sudden changes in trading behavior

**Recommendation:**
- Keep trading activity consistent with your stated purpose
- Document your trading strategy and risk management
- Respond promptly to any inquiries from Polymarket

---

## Data Privacy & Security

### Private Key Management

**CRITICAL SECURITY WARNING:**

**Current Implementation (Audit Finding A-001 - CRITICAL):**
- Private keys stored in plaintext environment variables
- No encryption or secure storage
- **NOT SUITABLE FOR PRODUCTION USE**

**Your Responsibilities:**
- NEVER commit private keys to version control
- Use secure secret management (see [Security Guide](./security.md))
- Rotate keys regularly
- Monitor wallet for unauthorized transactions

**Production Recommendations:**
- Use AWS Secrets Manager, HashiCorp Vault, or Azure Key Vault
- Implement key rotation procedures
- Enable wallet transaction alerts
- Maintain offline backup of seed phrase

**Reference:** [docs/security.md](./security.md) - Complete security guide

### Personal Data

**This bot processes personal financial data:**
- Wallet addresses
- Trading history
- Position sizes and PnL
- API credentials

**Your Responsibilities:**
- Comply with data protection laws (GDPR, CCPA, etc.)
- Implement appropriate security measures
- Do not share or sell user data
- Provide data deletion capabilities if required

**Current Implementation:**
- ❌ No database persistence (all in-memory)
- ❌ No audit trail or transaction history
- ⚠️ Wallet address logged at startup (Audit Finding A-022 - LOW)

---

## Incident Response & Reporting

### Security Incidents

**If you discover a security vulnerability:**
1. **Do NOT open a public GitHub issue**
2. Email security contact (check SECURITY.md if available)
3. Provide detailed description and reproduction steps
4. Allow reasonable time for response before public disclosure

**For Polymarket platform issues:**
- Contact: support@polymarket.com
- Emergency response may be available for critical issues

### Compliance Incidents

**If you suspect a compliance violation:**
1. Immediately halt trading using the kill switch:
   ```bash
   curl -X POST http://localhost:3000/kill-switch \
     -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
     -d '{"scope": "all", "reason": "compliance investigation"}'
   ```
2. Preserve all logs and transaction records
3. Consult with legal counsel
4. Self-report to Polymarket if required
5. Cooperate fully with any investigation

**Reference:** [docs/runbook.md](./runbook.md) - Kill switch procedures

---

## Audit Findings & Security Status

### Critical Security Issues

**Before using this bot in production, you MUST address these critical findings:**

| Finding ID | Severity | Issue | Status |
|------------|----------|-------|--------|
| **A-001** | CRITICAL | Plaintext private key storage | ❌ Open |
| **A-002** | CRITICAL | Kill switch state not persisted | ✅ Resolved (kill switch state now persisted to `.state/kill-switch.json` and restored on startup) |
| **A-003** | CRITICAL | CORS set to wildcard `*` | ❌ Open |

_Note:_ A-002 was marked **Open** in the original audit report (dated 2026-02-01). The kill switch persistence issue has since been remediated in the codebase; see [ADR-0004](./adr/0004-kill-switch-persistence.md) and the current [Runbook](./runbook.md#kill-switch) for details on the persistence implementation.

**Full Audit Report:** [REPORTS/AUDIT.md](../REPORTS/AUDIT.md) - 27 findings total

**Production Readiness:** [REPORTS/GAP_ANALYSIS.md](../REPORTS/GAP_ANALYSIS.md) - 🔴 NOT PRODUCTION READY

### Your Responsibility

**By using this software, you acknowledge:**
1. You have read the full audit report
2. You understand the security vulnerabilities
3. You accept the risk of using unresolved code
4. You will not use this for production trading until critical issues are resolved
5. You are solely responsible for any financial losses

---

## Acknowledgment of Compliance Responsibility

**When you set `COMPLIANCE_ACCEPTED=true`, you affirm:**

1. ✅ I have read and understood this compliance document in full
2. ✅ I am NOT located in a prohibited jurisdiction
3. ✅ I have read and agree to Polymarket's Terms of Service
4. ✅ I understand the financial and legal risks of automated trading
5. ✅ I am solely responsible for compliance with all applicable laws
6. ✅ I have implemented appropriate security measures for my private key
7. ✅ I have reviewed the audit findings and accept the associated risks
8. ✅ I will monitor regulatory changes and adapt my usage accordingly
9. ✅ I will cease trading immediately if I become ineligible or non-compliant

**This is a legal acknowledgment.** Setting this flag does not grant you any additional rights or shift liability to the software authors.

---

## Disclaimer

**NO LIABILITY:**

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

**YOU ASSUME ALL RISK** associated with using this software. The authors make no representations about compliance with any laws or regulations. You are solely responsible for determining whether your use complies with applicable law.

**NOT FINANCIAL ADVICE:**

Nothing in this software or documentation constitutes financial, legal, or tax advice. Consult with qualified professionals before making financial decisions.

---

## Additional Resources

**Internal Documentation:**
- [Security Guide](./security.md) - Private key security and best practices
- [Runbook](./runbook.md) - Operational procedures and emergency response
- [Architecture](./architecture.md) - Technical system design
- [UMA Resolution Guide](./uma-resolution.md) - Market resolution & dispute process
- [Troubleshooting](./troubleshooting.md) - Common issues and solutions

**External Resources:**
- [Polymarket Documentation](https://docs.polymarket.com/)
- [UMA Protocol Documentation](https://docs.uma.xyz/)
- [U.S. Treasury OFAC Sanctions List](https://sanctionssearch.ofac.treas.gov/)
- [CFTC - Prediction Markets](https://www.cftc.gov/IndustryOversight/TradingOrganizations/EventMarkets/index.htm)

**Legal:**
- Consult legal counsel for jurisdiction-specific guidance
- This document is not legal advice
- Laws change frequently - stay informed

---

**Last Updated:** 2026-02-08  
**Document Version:** 1.0  
**Review Frequency:** Quarterly or when regulations change
