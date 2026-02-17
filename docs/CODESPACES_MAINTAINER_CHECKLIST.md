# Codespaces Setup Checklist for Maintainers

This checklist guides repository maintainers through the process of configuring GitHub Codespaces secrets and environment variables for full testing capability.

## Overview

This setup enables contributors and agents to test all bot features in Codespaces without requiring real credentials or risking production data. All values should be fake/test credentials that are safe to use in development environments.

## Step 1: Configure Codespaces Secrets

Navigate to: **Repository Settings → Secrets and variables → Codespaces → Secrets tab**

Click "New repository secret" for each of the following:

### AWS Secrets Manager (optional - Method 3)
**Note:** AWS Secrets Manager integration is implemented. If you set **fake** AWS credentials in Codespaces secrets, `SECRET_SOURCE=aws` will fail with auth/permissions errors (expected) — useful only to verify fail-closed behavior. For end-to-end AWS testing, use a dedicated test AWS account and restricted IAM role.
```
Name: AWS_ACCESS_KEY_ID
Value: AKIAIOSFODNN7EXAMPLE
Description: Optional fake AWS access key (use only for fail-closed testing)
```

```
Name: AWS_SECRET_ACCESS_KEY
Value: wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
Description: Optional fake AWS secret key (use only for fail-closed testing)
```

### Azure Key Vault (optional - Method 5)
**Note:** Azure Key Vault integration is implemented. If you set **fake** Azure credentials in Codespaces secrets, `SECRET_SOURCE=azure` will fail authentication (expected) — useful only to verify fail-closed behavior. For end-to-end Azure testing, use a dedicated test tenant/subscription and a managed identity or service principal with minimal permissions.
```
Name: AZURE_CLIENT_ID
Value: 12345678-1234-1234-1234-123456789012
Description: Optional fake Azure client ID (use only for fail-closed testing)
```

```
Name: AZURE_CLIENT_SECRET
Value: test-secret-value-not-real-safe-for-dev
Description: Optional fake Azure client secret (use only for fail-closed testing)
```

```
Name: AZURE_TENANT_ID
Value: 87654321-4321-4321-4321-210987654321
Description: Optional fake Azure tenant ID (use only for fail-closed testing)
```

### HashiCorp Vault (optional - Method 4)
**Note:** HashiCorp Vault integration is implemented. If you set a **fake** `VAULT_TOKEN`, `SECRET_SOURCE=vault` will fail with permission/auth errors (expected). For end-to-end Vault testing, use a dedicated dev/test Vault with a minimal read-only policy.
```
Name: VAULT_TOKEN
Value: hvs.test_fake_token_for_development_only
Description: Optional fake Vault token (use only for fail-closed testing)
```

### Encrypted Storage (for testing Method 2)
```
Name: ENCRYPTION_KEY
Value: test-passphrase-for-encryption-not-secure
Description: Test passphrase for encrypted private key storage testing
```

### Telegram Alerting
```
Name: TELEGRAM_BOT_TOKEN
Value: 1234567890:ABCdefGHIjklMNOpqrsTUVwxyz-FAKE-TOKEN
Description: Fake Telegram bot token for testing alerting system
```

```
Name: TELEGRAM_CHAT_ID
Value: 123456789
Description: Fake Telegram chat ID for testing alerting system
```

### Test Private Key
```
Name: PRIVATE_KEY
Value: 0000000000000000000000000000000000000000000000000000000000000001
Description: Test private key with NO FUNDS for development/testing only
```

**IMPORTANT:** This is a well-known test private key. Never use it with real funds.

## Step 2: Configure Codespaces Environment Variables (Optional)

Navigate to: **Repository Settings → Secrets and variables → Codespaces → Variables tab**

These variables can be set if you want default values for all Codespaces. Alternatively, contributors can use the `.env.example` file.

### Recommended Default Variables

Click "New repository variable" for each:

#### Core Configuration
```
Name: LIVE_TRADING
Value: false
Description: Always keep false for Codespaces
```

```
Name: COMPLIANCE_ACCEPTED
Value: false
Description: Always keep false for Codespaces
```

```
Name: LOG_LEVEL
Value: debug
Description: Verbose logging for development
```

```
Name: ADMIN_TOKEN
Value: test-admin-token-for-development-only
Description: Test admin token for API testing
```

```
Name: ALLOWED_ORIGINS
Value: *
Description: Allow all origins in Codespaces (development only)
```

#### Learning System (Optional - for testing)
```
Name: LEARNING_SYSTEM_ENABLED
Value: true
Description: Enable learning system for testing
```

```
Name: METRICS_ENABLED
Value: true
Description: Enable metrics collection for testing
```

#### WebSocket Configuration
```
Name: WS_RECONNECT_DELAY
Value: 1000
Description: Fast reconnection for development
```

**Note:** Most other variables have sensible defaults in the code and `.env.example`, so they don't need to be set at the Codespaces level.

## Step 3: Test the Setup

After configuration, test that everything works:

1. Open a new Codespace or rebuild existing one
2. Verify secrets are loaded:
   ```bash
   # Secrets are available as environment variables in the Codespace.
   # Do NOT echo/print environment variables or log secret values.
   npm run dev
   ```

3. Test secret management methods:
   ```bash
   # Local methods
   SECRET_SOURCE=env npm run dev
   SECRET_SOURCE=encrypted npm run dev
   
   # Cloud methods (require valid credentials + a configured secret in the target system)
   # If you configured only fake credentials, these are expected to fail fast with auth/permission errors.
   SECRET_SOURCE=aws npm run dev
   SECRET_SOURCE=azure npm run dev
   SECRET_SOURCE=vault npm run dev
   ```

4. Run the test suite:
   ```bash
   npm test
   ```

## Step 4: Document for Contributors

Ensure contributors know about the setup:
- Link to [docs/CODESPACES_SETUP.md](../docs/CODESPACES_SETUP.md) in README
- Mention Codespaces as a quick start option
- Note that all credentials are fake/test values

## Security Notes

### ✅ DO:
- Use fake/test credentials for all secrets
- Keep `LIVE_TRADING=false` in all Codespaces configs
- Regularly rotate test credentials if needed
- Document that these are test values only

### ❌ DON'T:
- Never put real AWS/Azure credentials in Codespaces secrets
- Never put real private keys with funds
- Never enable live trading in Codespaces defaults
- Never share production secrets for testing

## CI/CD Configuration (Bonus)

The same secrets can be configured for GitHub Actions to enable testing in CI. Unit tests mock AWS/Azure/Vault SDK calls, so CI does not require real cloud credentials to validate these code paths.

Navigate to: **Repository Settings → Secrets and variables → Actions**

Configure the same secrets as above in the "Secrets" tab. This allows CI workflows to test environment-variable based secrets and encrypted secrets; AWS/Azure/Vault integrations will be covered once those backends are implemented.

## Troubleshooting

### Issue: Secrets not loading in Codespace
**Solution:** Secrets are only loaded when the Codespace is created or rebuilt. After adding new secrets:
1. Stop the Codespace
2. Go to github.com/codespaces
3. Click "..." next to your Codespace
4. Select "Rebuild container"

### Issue: Secret values showing as empty
**Solution:** Check that:
1. Secrets are set in "Codespaces" section (not "Actions")
2. Secret names match exactly (case-sensitive)
3. Codespace was rebuilt after adding secrets

### Issue: Runtime fails with "Missing credentials" / auth errors (AWS/Azure/Vault)
**Solution:** Cloud secret backends require valid credentials and network access. In Codespaces we recommend avoiding real cloud credentials by default; rely on unit tests for coverage. If you do need to test end-to-end, use a dedicated test account/tenant and minimal permissions.

## Verification Checklist

- [ ] All required Codespaces secrets configured (cloud secrets optional)
- [ ] Optional environment variables set (if desired)
- [ ] Test Codespace created and secrets verified
- [ ] Secret management methods tested (should fail gracefully)
- [ ] Test suite runs successfully
- [ ] Documentation links verified
- [ ] Contributors informed about Codespaces option
- [ ] CI/CD secrets configured (optional, for GitHub Actions testing)

## Next Steps

Once this setup is complete:
1. Update README.md to mention Codespaces as a quick start option
2. Test that new contributors can start a Codespace and run the bot
3. Verify all features are testable in Codespaces
4. Consider adding a "Open in Codespace" badge to README

## Additional Resources

- [GitHub Codespaces Documentation](https://docs.github.com/en/codespaces)
- [Managing encrypted secrets for Codespaces](https://docs.github.com/en/codespaces/managing-your-codespaces/managing-encrypted-secrets-for-your-codespaces)
- [Codespaces Setup Guide for Contributors](../docs/CODESPACES_SETUP.md)
- [Environment Variables Reference](../.env.example)

---

**Last Updated:** 2026-02-08  
**Maintained By:** Repository maintainers  
**Status:** Ready for implementation
