# Secret Management Quick Reference

**Print this page and keep it accessible for emergency procedures.**

## Emergency Contacts

- **Security Team:** [Add contact information]
- **Operations Lead:** [Add contact information]
- **On-Call Engineer:** [Add contact information]

## Secret Rotation Schedule

| Secret | When to Rotate | Downtime | Procedure Link |
|--------|---------------|----------|----------------|
| ADMIN_TOKEN | Every 30 days | None | [Zero-downtime rotation](./security.md#admin_token-rotation-zero-downtime) |
| ENCRYPTION_KEY | Every 90 days | 2-5 min | [Rotation procedure](./security.md#encryption_key-rotation) |
| PRIVATE_KEY | Emergency only | Yes | [Wallet rotation](./security.md#private_key-compromise) |
| AWS/Vault/Azure | Every 90 days | Brief | [KMS rotation](./security.md#production-setup) |

## Quick Commands

### Check Current Status
```bash
# Health check
curl http://localhost:3000/health

# Trading status (requires ADMIN_TOKEN)
curl -H "Authorization: Bearer $ADMIN_TOKEN" http://localhost:3000/status

# Check logs for errors
tail -f logs/bot-$(date +%Y%m%d).log | grep ERROR
```

### Generate New Secrets
```bash
# Generate new ADMIN_TOKEN
openssl rand -hex 32

# Generate new ENCRYPTION_KEY
openssl rand -base64 32
```

### Emergency Stop
```bash
# Graceful shutdown
npm run kill

# Force stop
pkill -f "npm run dev"
```

## Emergency Procedures

### ADMIN_TOKEN Compromised

**⚠️ IMMEDIATE ACTION REQUIRED**

1. Generate new token: `openssl rand -hex 32`
2. Update .env: `ADMIN_TOKEN=new_token_here`
3. Restart bot: `pkill -f "npm run dev" && npm run dev`
4. Verify old token rejected: `curl -H "Authorization: Bearer old_token" http://localhost:3000/status` (expect 401)
5. Document in log: `echo "$(date -u) - ADMIN_TOKEN revoked due to compromise" >> logs/security-incidents.log`

**Full procedure:** [Emergency Secret Revocation](./security.md#emergency-secret-revocation)

### PRIVATE_KEY Compromised

**🚨 CRITICAL - FUNDS AT RISK**

1. **IMMEDIATELY stop bot:** `npm run kill && pkill -f "npm run dev"`
2. **Transfer funds** to new wallet using web interface or separate tool
3. Generate new wallet (offline, secure method)
4. Update bot configuration with new wallet
5. Document incident thoroughly

**Full procedure:** [Private Key Compromise](./security.md#private_key-compromise)

### Lost ENCRYPTION_KEY

**Recovery steps:**

1. Retrieve unencrypted PRIVATE_KEY from secure backup
2. Generate new ENCRYPTION_KEY: `openssl rand -base64 32`
3. Re-encrypt private key with new key
4. Update .env and restart bot

**Full procedure:** [Recovery Procedures](./security.md#recovery-procedures)

## Pre-Rotation Checklist

Before rotating any secret:

- [ ] Backup of current secret is secure
- [ ] Maintenance window scheduled (if needed)
- [ ] Rollback procedure understood
- [ ] Team notified
- [ ] Monitoring in place

## Post-Rotation Checklist

After rotating any secret:

- [ ] New secret works correctly
- [ ] Old secret is rejected (where applicable)
- [ ] No errors in logs
- [ ] Trading functionality verified
- [ ] Rotation documented
- [ ] New secret backed up

## Common Issues and Solutions

### "401 Unauthorized" on Admin Endpoints

**Cause:** ADMIN_TOKEN missing, incorrect, or not set in request

**Solution:**
```bash
# Check token is set
grep ADMIN_TOKEN .env

# Test with correct token
curl -H "Authorization: Bearer $ADMIN_TOKEN" http://localhost:3000/status
```

### "Failed to decrypt private key"

**Cause:** Wrong ENCRYPTION_KEY or corrupted ENCRYPTED_PRIVATE_KEY

**Solution:**
1. Verify ENCRYPTION_KEY is correct
2. Try retrieving backup values
3. Re-encrypt from unencrypted backup if needed

### Bot fails to start after secret rotation

**Cause:** Invalid configuration or missing required secrets

**Solution:**
1. Check logs: `tail -n 100 logs/bot-$(date +%Y%m%d).log`
2. Verify all required secrets are set: `grep -E "ADMIN_TOKEN|PRIVATE_KEY|ENCRYPTION_KEY" .env`
3. Rollback to previous working configuration
4. Investigate issue before retrying

## Important File Locations

| File | Purpose | Path |
|------|---------|------|
| Environment config | Secret values | `.env` |
| Security operations log | Rotation history | `logs/security-ops.log` |
| Security incidents log | Compromise events | `logs/security-incidents.log` |
| Application logs | Runtime logs | `logs/bot-YYYYMMDD.log` |

## Security Best Practices

1. **Never commit secrets** to source control
2. **Store backups encrypted** in password manager
3. **Rotate on schedule** - set calendar reminders
4. **Document all changes** in security operations log
5. **Test recovery** procedures regularly (quarterly)
6. **Use KMS in production** (AWS/Vault/Azure)
7. **Enable monitoring** for failed authentication attempts
8. **Review access logs** weekly for suspicious activity

## Logging Format

All secret operations must be logged:

```bash
# Add to security operations log
echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) - [SECRET_TYPE] [ACTION] by [OPERATOR] - [STATUS]" >> logs/security-ops.log

# Examples:
# 2026-02-18T14:30:00Z - ADMIN_TOKEN rotation by ops@example.com - SUCCESS
# 2026-02-18T14:35:00Z - ENCRYPTION_KEY rotation initiated by ops@example.com
# 2026-02-18T14:37:00Z - ENCRYPTION_KEY rotation completed by ops@example.com - SUCCESS
```

## Additional Resources

- **Complete procedures:** [docs/security.md](./security.md)
- **Architecture decisions:** [docs/adr/0005-secrets-management.md](./adr/0005-secrets-management.md)
- **Operations runbook:** [docs/runbook.md](./runbook.md)
- **Deployment guide:** [docs/deployment-guide.md](./deployment-guide.md)

## Version

**Document Version:** 1.0  
**Last Updated:** 2026-02-18  
**Next Review:** 2026-05-18

---

**Remember:** When in doubt, stop the bot, transfer funds to safety, and consult the full documentation before proceeding.
