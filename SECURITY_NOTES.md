# Security Notes

## Known Low-Severity Vulnerabilities

### Elliptic Cryptographic Implementation (GHSA-848j-6mx2-7j84)

**Status:** Accepted Risk  
**Severity:** Low (CVSS 5.6)  
**Affected Package:** `elliptic` <=6.6.1 (transitive dependency via @ethersproject)

**Description:**
The elliptic package uses a cryptographic primitive with a risky implementation. This is a transitive dependency through @ethersproject packages used by @polymarket/clob-client.

**Impact Assessment:**
- **Exploitability:** Requires high attack complexity (AC:H)
- **Impact:** Limited confidentiality, integrity, and availability impact
- **Context:** Used for wallet signing operations in Polymarket CLOB client
- **Risk Level:** LOW for this application's use case

**Fix Available:**
Downgrading @polymarket/clob-client from v5.2.1 to v4.22.8 would resolve the vulnerability, but this is a **BREAKING CHANGE** that would:
- Remove features and improvements from v5.x
- Potentially break compatibility with current Polymarket API
- Require extensive testing and code changes

**Mitigation:**
1. **Current Approach:** Accept the low-severity risk
2. **Private Key Protection:** Primary defense is secure key management (see A-001)
   - Use encrypted storage or secret managers
   - Never expose private keys in logs or errors
   - Follow security best practices in docs/security.md
3. **Monitor:** Watch for elliptic updates or @ethersproject/clob-client updates that resolve this
4. **Future:** When @polymarket/clob-client updates dependencies, reassess

**Recommendations:**
- **For Development/Testing:** Acceptable risk, proceed with current versions
- **For Production:** 
  - Implement secure key management (A-001 recommendations)
  - Monitor for upstream package updates
  - Consider cloud secret managers (AWS/Vault/Azure) for key storage
  - Implement additional key rotation policies

**References:**
- Advisory: https://github.com/advisories/GHSA-848j-6mx2-7j84
- Audit Finding: See AUDIT_STATUS.md A-001 for related key security recommendations
- Package: @polymarket/clob-client v5.2.1

**Decision Date:** 2026-02-11  
**Review Date:** Check quarterly or when dependencies update  
**Approved By:** Development Team

---

## Security Best Practices

To minimize risk from low-severity vulnerabilities:

1. **Keep Dependencies Updated:** Regularly run `npm update` and `npm audit`
2. **Monitor Security Advisories:** Watch GitHub Security Advisories
3. **Implement Defense in Depth:** Multiple layers of security (key management, network security, access controls)
4. **Follow OWASP Guidelines:** Web application security best practices
5. **Regular Security Reviews:** Quarterly audits of dependencies and code

---

## Audit Tracking

This file tracks security vulnerabilities and decisions. Related documents:
- [AUDIT_STATUS.md](./AUDIT_STATUS.md) - Implementation status of 27 audit findings
- [docs/security.md](./docs/security.md) - Security guide and best practices
- [REPORTS/AUDIT.md](./REPORTS/AUDIT.md) - Original security audit report
