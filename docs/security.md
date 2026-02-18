# Security Guide

This guide explains how to securely configure and operate the Polymarket trading bot.

**Addresses:** 
- Audit Finding A-001 (CRITICAL) - Plaintext Private Key Storage
- Audit Finding A-004 (HIGH) - Optional Admin Authentication

## Table of Contents

1. [Overview](#overview)
2. [API Authentication](#api-authentication)
3. [Private Key Management](#private-key-management)
4. [Security Levels](#security-levels)
5. [Setup Methods](#setup-methods)
6. [Encryption Tool](#encryption-tool)
7. [Production Setup](#production-setup)
8. [Security Best Practices](#security-best-practices)
9. [Secret Management Operations](#secret-management-operations)
10. [Troubleshooting](#troubleshooting)

## Overview

The trading bot requires secure configuration for two critical areas:
1. **API Authentication** - Protects administrative endpoints from unauthorized access
2. **Private Key Management** - Secures your wallet credentials used to sign transactions

### ⚠️ Critical Security Warnings

**API Security:**
- `ADMIN_TOKEN` is **REQUIRED** for production and live trading to access admin endpoints
- If `ADMIN_TOKEN` is **unset**, sensitive admin endpoints return HTTP 401 and are effectively disabled (fail‑closed)
- If `ADMIN_TOKEN` is set but weak/guessable or shared, anyone who obtains it can use kill switch, order management, and trading status endpoints

**Private Key Security:**
- **NEVER commit your private key or .env file to source control**
- Your private key controls real funds - if compromised, all trading funds can be stolen
- No recovery is possible if your key is compromised

## API Authentication

**Addresses:** Audit Finding A-004 (HIGH) - Optional Admin Authentication

### Overview

All sensitive API endpoints require authentication using an admin token. This prevents unauthorized access to critical bot operations.

### Protected Endpoints

The following endpoints require a valid `ADMIN_TOKEN` in the `Authorization` header:

- `GET /status` - Trading status, wallet address, connection state
- `GET /state` - Orders, positions, balances
- `GET /orders` - Order information
- `GET /fills` - Fill history
- `POST /kill` - Emergency kill switch activation
- `POST /kill-switch` - Legacy kill switch endpoint

### Public Endpoints

These endpoints do NOT require authentication:

- `GET /health` - Health check
- `GET /ready` - Readiness probe
- `GET /metrics` - Prometheus metrics
- `GET /orderbooks` - Market orderbook data
- `GET /orderbook/:tokenId` - Specific orderbook
- `GET /feed/status` - Market feed status

### Setup

#### 1. Generate a Secure Token

```bash
# Generate a cryptographically secure random token
openssl rand -hex 32

# Example output: 5f8e3c2b1a9d7e4f6c8b2a5d3e7f9c1b4a6d8e2f5c7b9a3d1e4f6c8b2a5d3e7f
```

#### 2. Configure Environment

```bash
# .env
ADMIN_TOKEN=5f8e3c2b1a9d7e4f6c8b2a5d3e7f9c1b4a6d8e2f5c7b9a3d1e4f6c8b2a5d3e7f
```

#### 3. Use in API Requests

```bash
# Using Bearer token format (recommended)
curl -H "Authorization: Bearer YOUR_ADMIN_TOKEN" http://localhost:3000/status

# Using plain token (also supported)
curl -H "Authorization: YOUR_ADMIN_TOKEN" http://localhost:3000/status
```

### Production Requirements

**CRITICAL:** The server will **fail to start** in production or live trading mode without a valid `ADMIN_TOKEN`.

```bash
# This will FAIL in production
NODE_ENV=production npm run dev
# Error: CRITICAL SECURITY ERROR: ADMIN_TOKEN is required for production mode...

# This will FAIL with live trading
LIVE_TRADING=true npm run dev
# Error: CRITICAL SECURITY ERROR: ADMIN_TOKEN is required for live trading mode...

# This will SUCCEED
ADMIN_TOKEN=your_secure_token npm run dev
```

The bot enforces this requirement to prevent accidental deployment without authentication.

### Security Best Practices

1. **Never hardcode tokens** - Always use environment variables
2. **Use strong tokens** - Minimum 32 bytes of random data (64 hex characters)
3. **Rotate regularly** - Change tokens periodically and after any suspected compromise
4. **Limit exposure** - Only share tokens with authorized personnel
5. **Use HTTPS** - Always use TLS/SSL in production to protect tokens in transit
6. **Monitor access** - Review logs for unauthorized access attempts (401 responses)

### Zero-Downtime Token Rotation (GAP-038)

To rotate the admin token without restarting the bot (no downtime), use a dual-token window:

1. Set the current token in `ADMIN_TOKEN` and the new token in `ADMIN_TOKEN_NEXT`
2. Trigger a reload via `POST /api/config/reload` (authorized with the current token)
3. During the rotation window, **both tokens are accepted** for admin endpoints
4. After all clients are updated, set `ADMIN_TOKEN` to the new token, clear `ADMIN_TOKEN_NEXT`, and reload again

This pattern reduces operational risk while keeping admin endpoints fail-closed if no token is configured.

### Testing Authentication

```bash
# Start server with token
ADMIN_TOKEN=test-token npm run dev

# Test without auth (should fail with 401)
curl http://localhost:3000/status

# Test with auth (should succeed)
curl -H "Authorization: Bearer test-token" http://localhost:3000/status
```

## Private Key Management

This section explains how to securely manage your wallet private key for the Polymarket trading bot.

### ⚠️ Critical Security Warning

**NEVER commit your private key or .env file to source control.**

Your private key controls real funds. If compromised:
- Attacker can drain your wallet
- All trading funds can be stolen
- No recovery possible

## Security Levels

| Method | Security | Use Case | Setup Difficulty |
|--------|----------|----------|------------------|
| Environment Variable | 🔴 LOW | Local development only | Easy |
| Encrypted Local | 🟡 MEDIUM | Single-server deployment | Medium |
| AWS Secrets Manager | 🟢 HIGH | AWS production | Medium |
| HashiCorp Vault | 🟢 HIGH | Multi-cloud production | Hard |
| Azure Key Vault | 🟢 HIGH | Azure production | Medium |

## Setup Methods

### Method 1: Environment Variable (Development Only)

**Security Level:** 🔴 LOW - **NEVER use in production**

This is the simplest method but provides minimal security. Use only for local development with test funds.

```bash
# .env
SECRET_SOURCE=env
PRIVATE_KEY=0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef
```

**Risks:**
- Key visible to anyone with file system access
- May be logged by system tools
- No audit trail
- No rotation capability

### Method 2: Encrypted Local Storage (Improved)

**Security Level:** 🟡 MEDIUM - Suitable for single-server deployments

Encrypts your private key with AES-256-GCM. Requires a strong passphrase.

#### Step 1: Generate an encryption key

```bash
# Generate a strong random passphrase (save securely!)
openssl rand -base64 32
# Example output: Kx8Pq2Nm4Rv6Wt9Zc1Hj5Gs7Uf3Yb0Xa==
```

#### Step 2: Encrypt your private key

```bash
# Install dependencies first
npm install

# Create a temporary encryption script
cat > /tmp/encrypt-key.js << 'EOF'
const { encryptPrivateKey } = require('./apps/backend/src/secrets');

const privateKey = process.argv[2];
const passphrase = process.argv[3];

if (!privateKey || !passphrase) {
  console.error('Usage: node encrypt-key.js <private-key> <passphrase>');
  process.exit(1);
}

try {
  const encrypted = encryptPrivateKey(privateKey, passphrase);
  console.log('\nEncrypted private key:');
  console.log(encrypted);
  console.log('\nAdd to your .env:');
  console.log('SECRET_SOURCE=encrypted');
  console.log('ENCRYPTION_KEY=' + passphrase);
  console.log('ENCRYPTED_PRIVATE_KEY=' + encrypted);
} catch (error) {
  console.error('Error:', error.message);
  process.exit(1);
}
EOF

# Run the encryption (replace with your actual key and passphrase)
node /tmp/encrypt-key.js "0x1234..." "Kx8Pq2Nm4Rv6Wt9Zc1Hj5Gs7Uf3Yb0Xa=="

# Delete the temporary script
rm /tmp/encrypt-key.js
```

#### Step 3: Update your .env

```bash
# .env
SECRET_SOURCE=encrypted
ENCRYPTION_KEY=Kx8Pq2Nm4Rv6Wt9Zc1Hj5Gs7Uf3Yb0Xa==
ENCRYPTED_PRIVATE_KEY=1a2b3c4d...:5e6f7g8h...:9i0j1k2l...:3m4n5o6p...
```

**Security Improvements:**
- ✅ Private key encrypted at rest
- ✅ Requires passphrase to decrypt
- ✅ Different IV/salt each time (non-deterministic)
- ⚠️ Passphrase still in environment
- ⚠️ No audit trail

### Method 3: AWS Secrets Manager (Production)

**Security Level:** 🟢 HIGH - Recommended for AWS deployments

#### Prerequisites

- AWS account with appropriate permissions
- AWS CLI configured
- IAM role or user with `secretsmanager:GetSecretValue` permission

#### Step 1: Create the secret

```bash
# Create secret in AWS Secrets Manager
aws secretsmanager create-secret \
  --name polymarket-bot/private-key \
  --description "Polymarket bot wallet private key" \
  --secret-string '{"privateKey":"0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"}' \
  --region us-east-1

# Verify secret was created
aws secretsmanager describe-secret \
  --secret-id polymarket-bot/private-key \
  --region us-east-1
```

#### Step 2: Grant IAM permissions

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "secretsmanager:GetSecretValue"
      ],
      "Resource": "arn:aws:secretsmanager:us-east-1:ACCOUNT_ID:secret:polymarket-bot/private-key-*"
    }
  ]
}
```

#### Step 3: Configure the bot

```bash
# .env
SECRET_SOURCE=aws
AWS_SECRET_NAME=polymarket-bot/private-key
AWS_REGION=us-east-1

# AWS credentials (via IAM role, instance profile, or environment)
# AWS_ACCESS_KEY_ID=...
# AWS_SECRET_ACCESS_KEY=...
```

#### Step 4: Enable secret rotation (optional)

```bash
# Enable automatic rotation every 30 days
aws secretsmanager rotate-secret \
  --secret-id polymarket-bot/private-key \
  --rotation-lambda-arn arn:aws:lambda:us-east-1:ACCOUNT_ID:function:rotation-function \
  --rotation-rules AutomaticallyAfterDays=30
```

**Security Benefits:**
- ✅ Centralized secret management
- ✅ Audit logs via CloudTrail
- ✅ IAM-based access control
- ✅ Automatic rotation support
- ✅ Encryption at rest (AWS KMS)
- ✅ No secrets in source code or environment

### Method 4: HashiCorp Vault (Production)

**Security Level:** 🟢 HIGH - Recommended for multi-cloud or on-premise

#### Prerequisites

- Vault server running and accessible
- Vault authentication token
- Vault policy allowing secret read access

#### Step 1: Write the secret to Vault

```bash
# Using Vault CLI
vault kv put secret/polymarket \
  privateKey="0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"

# Verify the secret
vault kv get secret/polymarket
```

#### Step 2: Create access policy

```bash
# Create policy file
cat > polymarket-policy.hcl << 'EOF'
path "secret/data/polymarket" {
  capabilities = ["read"]
}
EOF

# Apply policy
vault policy write polymarket-bot polymarket-policy.hcl

# Create token with policy
vault token create -policy=polymarket-bot
```

#### Step 3: Configure the bot

```bash
# .env
SECRET_SOURCE=vault
VAULT_ADDR=https://vault.example.com:8200
VAULT_TOKEN=hvs.CAESI...
VAULT_PATH=secret/data/polymarket
```

**Security Benefits:**
- ✅ Platform-agnostic
- ✅ Fine-grained access policies
- ✅ Dynamic secret generation
- ✅ Audit logs
- ✅ Token-based authentication
- ✅ High availability

### Method 5: Azure Key Vault (Production)

**Security Level:** 🟢 HIGH - Recommended for Azure deployments

#### Prerequisites

- Azure subscription
- Azure CLI installed
- Key Vault created

#### Step 1: Create the secret

```bash
# Create Key Vault (if not exists)
az keyvault create \
  --name my-polymarket-vault \
  --resource-group my-resource-group \
  --location eastus

# Store the secret
az keyvault secret set \
  --vault-name my-polymarket-vault \
  --name polymarket-private-key \
  --value "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"

# Verify secret
az keyvault secret show \
  --vault-name my-polymarket-vault \
  --name polymarket-private-key
```

#### Step 2: Grant access permissions

```bash
# Using Managed Identity (recommended)
az keyvault set-policy \
  --name my-polymarket-vault \
  --object-id <managed-identity-object-id> \
  --secret-permissions get

# Or using Service Principal
az keyvault set-policy \
  --name my-polymarket-vault \
  --spn <service-principal-app-id> \
  --secret-permissions get
```

#### Step 3: Configure the bot

```bash
# .env
SECRET_SOURCE=azure
AZURE_KEY_VAULT_NAME=my-polymarket-vault
AZURE_SECRET_NAME=polymarket-private-key

# Azure authentication (via Managed Identity, Service Principal, or CLI)
# AZURE_CLIENT_ID=...
# AZURE_TENANT_ID=...
# AZURE_CLIENT_SECRET=...
```

**Security Benefits:**
- ✅ Azure-native integration
- ✅ RBAC-based access control
- ✅ HSM-backed option available
- ✅ Audit logs via Azure Monitor
- ✅ Automatic key rotation
- ✅ Compliance certifications

## Encryption Tool

For Method 2 (Encrypted Local Storage), use this Node.js one-liner:

```javascript
// Encrypt a private key
node -p "
const crypto = require('crypto');
const privateKey = '0x1234...'; // Your key
const passphrase = 'your-passphrase';
const salt = crypto.randomBytes(16);
const key = crypto.pbkdf2Sync(passphrase, salt, 100000, 32, 'sha256');
const iv = crypto.randomBytes(16);
const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
let encrypted = cipher.update(privateKey, 'utf8', 'hex');
encrypted += cipher.final('hex');
const authTag = cipher.getAuthTag();
salt.toString('hex') + ':' + iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
"
```

Or use the built-in function:

```bash
npm install
node -e "const {encryptPrivateKey} = require('./apps/backend/src/secrets'); console.log(encryptPrivateKey('0x1234...', 'passphrase'));"
```

## Production Setup

### Checklist for Production Deployment

- [ ] Choose appropriate secret storage method (AWS/Vault/Azure)
- [ ] Remove plaintext `PRIVATE_KEY` from all environments
- [ ] Set `SECRET_SOURCE` to production method
- [ ] Configure KMS credentials securely (IAM role, not access keys)
- [ ] Enable audit logging in KMS
- [ ] Set up secret rotation schedule
- [ ] Test secret retrieval in staging
- [ ] Document emergency key recovery procedure
- [ ] Configure monitoring for secret access failures
- [ ] Review and restrict KMS access permissions

### Environment Variables

Production `.env` should look like:

```bash
# Trading gates
LIVE_TRADING=true
COMPLIANCE_ACCEPTED=true

# Secret management (choose one method)
SECRET_SOURCE=aws  # or vault, azure, encrypted
AWS_SECRET_NAME=polymarket-bot/private-key
AWS_REGION=us-east-1

# Do NOT include:
# PRIVATE_KEY=...  ❌ Never in production
```

## Security Best Practices

1. **Never Commit Secrets**
   - Add `.env` to `.gitignore`
   - Use `.env.example` for documentation
   - Scan commits with tools like `truffleHog`

2. **Use Strong Passphrases**
   - Minimum 32 characters
   - Generated randomly (not memorable)
   - Stored in password manager

3. **Rotate Keys Regularly**
   - Production: Every 90 days
   - After security incidents: Immediately
   - When staff leaves: Within 24 hours

4. **Limit Access**
   - Principle of least privilege
   - Use IAM roles, not access keys
   - Audit access logs regularly

5. **Monitor Key Usage**
   - Alert on failed decryption attempts
   - Log all key access (via KMS audit logs)
   - Alert on unusual access patterns

6. **Backup Securely**
   - Encrypted offline backups
   - Tested recovery procedures
   - Multiple backup locations

7. **Test Regularly**
   - Test secret rotation
   - Test key recovery
   - Test access revocation

## Troubleshooting

### Error: "PRIVATE_KEY environment variable is not set"

**Solution:** You're using `SECRET_SOURCE=env` but `PRIVATE_KEY` is not set.

```bash
# Either set the private key
export PRIVATE_KEY="0x1234..."

# Or use a different secret source
export SECRET_SOURCE=encrypted
```

### Error: "Retrieved private key is invalid"

**Solution:** Private key must be 64 hex characters (optionally prefixed with 0x).

```bash
# Valid formats:
PRIVATE_KEY=1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef
PRIVATE_KEY=0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef

# Invalid:
PRIVATE_KEY=0x1234  # Too short
PRIVATE_KEY=ghijklmn...  # Non-hex characters
```

### Error: "Failed to decrypt private key"

**Solution:** Wrong passphrase or corrupted encrypted data.

```bash
# Verify passphrase is correct
# Re-encrypt with correct passphrase
node -e "const {encryptPrivateKey} = require('./apps/backend/src/secrets'); console.log(encryptPrivateKey('0x1234...', 'correct-passphrase'));"
```

### Error: "Failed to retrieve private key from AWS Secrets Manager"

**Solution:** Ensure the AWS SDK can authenticate (IAM role or env credentials), the region is correct, and the secret value is in a supported format.

- **Required env**: `SECRET_SOURCE=aws`, `AWS_SECRET_NAME`
- **Optional env**: `AWS_REGION` (defaults to `us-east-1` if not set)
- **Supported secret value formats**:
  - Direct string: `"0x<64-hex>"` (or without `0x`)
  - JSON: `{"privateKey":"0x..."}`, `{"PRIVATE_KEY":"0x..."}`, or `{"private_key":"0x..."}`

If running locally, you can quickly verify access:

```bash
aws secretsmanager get-secret-value --secret-id "$AWS_SECRET_NAME" --region "${AWS_REGION:-us-east-1}"
```

### Error: "ENCRYPTION_KEY is required for encrypted secret source"

**Solution:** Set the encryption passphrase.

```bash
export ENCRYPTION_KEY="your-passphrase-here"
```

### Debugging

Enable debug logging:

```bash
LOG_LEVEL=debug npm run dev
```

Check the logs for secret loading:

```
{"level":"INFO","message":"Private key loaded securely","source":"encrypted"}
```

## Additional Resources

- [ADR-0005: Secrets Management](./adr/0005-secrets-management.md)
- [Audit Finding A-001](../REPORTS/AUDIT.md#a-001-critical---plaintext-private-key-storage)
- [OWASP Secrets Management](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)
- [AWS Secrets Manager Best Practices](https://docs.aws.amazon.com/secretsmanager/latest/userguide/best-practices.html)
- [HashiCorp Vault Documentation](https://www.vaultproject.io/docs)
- [Azure Key Vault Best Practices](https://docs.microsoft.com/azure/key-vault/general/best-practices)

## Secret Management Operations

This section provides step-by-step operational procedures for managing secrets in production. Follow these workflows exactly to avoid downtime or security incidents.

### Overview of Secret Types

| Secret | Purpose | Rotation Frequency | Downtime Required |
|--------|---------|-------------------|-------------------|
| ADMIN_TOKEN | API authentication | 30 days | No (with dual-token rotation) |
| PRIVATE_KEY | Wallet signing | On compromise only | Yes (requires new wallet) |
| ENCRYPTION_KEY | Local key encryption | 90 days | Yes (brief restart) |
| AWS/Vault/Azure credentials | KMS access | 90 days | Yes (brief restart) |
| TELEGRAM_BOT_TOKEN | Alerting | On compromise only | No |

### ADMIN_TOKEN Rotation (Zero-Downtime)

**Use case:** Regular rotation (every 30 days) or after suspected compromise.

#### Prerequisites
- Current ADMIN_TOKEN value
- Access to .env configuration
- Ability to trigger config reload

#### Step-by-Step Procedure

1. **Generate new token:**
   ```bash
   # Generate cryptographically secure token
   NEW_TOKEN=$(openssl rand -hex 32)
   echo "New token generated: $NEW_TOKEN"
   ```

2. **Update environment with dual-token configuration:**
   ```bash
   # Edit .env file
   # Keep current token as ADMIN_TOKEN
   # Add new token as ADMIN_TOKEN_NEXT
   
   # Before:
   # ADMIN_TOKEN=old_token_here
   
   # After:
   # ADMIN_TOKEN=old_token_here
   # ADMIN_TOKEN_NEXT=new_token_here
   ```

3. **Trigger config reload:**
   ```bash
   # Reload configuration using current token
   curl -X POST http://localhost:3000/api/config/reload \
     -H "Authorization: Bearer old_token_here"
   
   # Expected response: {"message": "Configuration reloaded successfully"}
   ```

4. **Verify both tokens work:**
   ```bash
   # Test old token (should still work)
   curl -H "Authorization: Bearer old_token_here" http://localhost:3000/status
   
   # Test new token (should now work)
   curl -H "Authorization: Bearer new_token_here" http://localhost:3000/status
   
   # Both should return 200 OK with status data
   ```

5. **Update all clients to use new token:**
   - Update monitoring scripts
   - Update automation tools
   - Update dashboard configuration
   - Verify each client works with new token

6. **Finalize rotation:**
   ```bash
   # Edit .env file
   # Move new token to ADMIN_TOKEN
   # Remove ADMIN_TOKEN_NEXT
   
   # Before:
   # ADMIN_TOKEN=old_token_here
   # ADMIN_TOKEN_NEXT=new_token_here
   
   # After:
   # ADMIN_TOKEN=new_token_here
   # (ADMIN_TOKEN_NEXT removed)
   ```

7. **Trigger final reload:**
   ```bash
   # Reload configuration using new token
   curl -X POST http://localhost:3000/api/config/reload \
     -H "Authorization: Bearer new_token_here"
   ```

8. **Verify old token no longer works:**
   ```bash
   # Test old token (should now fail)
   curl -H "Authorization: Bearer old_token_here" http://localhost:3000/status
   
   # Expected: 401 Unauthorized
   ```

9. **Document rotation:**
   ```bash
   # Log rotation in operations log
   echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) - ADMIN_TOKEN rotated successfully" >> logs/security-ops.log
   ```

#### Rollback Procedure

If issues occur during rotation:

1. **If step 3 fails:** Remove ADMIN_TOKEN_NEXT from .env, no reload needed
2. **If step 4-5 fail:** Remove ADMIN_TOKEN_NEXT from .env, reload with old token
3. **If step 7 fails:** Restore .env to have both tokens, reload with new token

### ENCRYPTION_KEY Rotation

**Use case:** Periodic rotation (every 90 days) or after suspected compromise.

**⚠️ WARNING:** This procedure requires brief downtime (2-5 minutes).

#### Prerequisites
- Current ENCRYPTION_KEY value
- Current ENCRYPTED_PRIVATE_KEY value
- Original unencrypted PRIVATE_KEY (from secure backup or KMS)
- Ability to restart the bot

#### Step-by-Step Procedure

1. **Schedule maintenance window:**
   ```bash
   # Notify stakeholders of 5-minute maintenance
   # Schedule during low-activity period
   ```

2. **Generate new encryption key:**
   ```bash
   # Generate new passphrase
   NEW_ENCRYPTION_KEY=$(openssl rand -base64 32)
   echo "New encryption key generated (save securely): $NEW_ENCRYPTION_KEY"
   ```

3. **Decrypt private key with old key:**
   ```bash
   # Create temporary decryption script
   cat > /tmp/decrypt-key.js << 'EOF'
   const { decryptPrivateKey } = require('./apps/backend/src/secrets');
   const encryptedKey = process.argv[2];
   const oldPassphrase = process.argv[3];
   try {
     const decrypted = decryptPrivateKey(encryptedKey, oldPassphrase);
     console.log(decrypted);
   } catch (error) {
     console.error('Decryption failed:', error.message);
     process.exit(1);
   }
   EOF
   
   # Decrypt with old key
   PRIVATE_KEY=$(node /tmp/decrypt-key.js "$ENCRYPTED_PRIVATE_KEY" "$ENCRYPTION_KEY")
   rm /tmp/decrypt-key.js
   ```

4. **Re-encrypt with new key:**
   ```bash
   # Create temporary encryption script
   cat > /tmp/encrypt-key.js << 'EOF'
   const { encryptPrivateKey } = require('./apps/backend/src/secrets');
   const privateKey = process.argv[2];
   const newPassphrase = process.argv[3];
   try {
     const encrypted = encryptPrivateKey(privateKey, newPassphrase);
     console.log(encrypted);
   } catch (error) {
     console.error('Encryption failed:', error.message);
     process.exit(1);
   }
   EOF
   
   # Encrypt with new key
   NEW_ENCRYPTED_PRIVATE_KEY=$(node /tmp/encrypt-key.js "$PRIVATE_KEY" "$NEW_ENCRYPTION_KEY")
   rm /tmp/encrypt-key.js
   
   # Clear private key from memory
   unset PRIVATE_KEY
   ```

5. **Update .env file:**
   ```bash
   # Before:
   # ENCRYPTION_KEY=old_passphrase_here
   # ENCRYPTED_PRIVATE_KEY=old_encrypted_data_here
   
   # After:
   # ENCRYPTION_KEY=new_passphrase_here
   # ENCRYPTED_PRIVATE_KEY=new_encrypted_data_here
   ```

6. **Restart bot:**
   ```bash
   # Graceful shutdown
   npm run kill  # or use kill switch endpoint
   
   # Wait for shutdown to complete
   sleep 5
   
   # Start with new configuration
   npm run dev
   ```

7. **Verify successful decryption:**
   ```bash
   # Check logs for successful private key loading
   tail -n 50 logs/bot-$(date +%Y%m%d).log | grep "Private key loaded"
   
   # Expected: "Private key loaded securely" with source="encrypted"
   ```

8. **Verify trading functionality:**
   ```bash
   # Test wallet connection
   curl http://localhost:3000/status | jq '.walletAddress'
   
   # Should return wallet address, not null
   ```

9. **Document rotation:**
   ```bash
   echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) - ENCRYPTION_KEY rotated successfully" >> logs/security-ops.log
   ```

#### Rollback Procedure

If decryption fails after restart:

1. **Stop the bot immediately**
2. **Restore old .env values:**
   ```bash
   ENCRYPTION_KEY=old_passphrase_here
   ENCRYPTED_PRIVATE_KEY=old_encrypted_data_here
   ```
3. **Restart bot**
4. **Investigate failure before retrying**

### Emergency Secret Revocation

**Use case:** Immediate response to secret compromise or unauthorized access.

#### ADMIN_TOKEN Compromise

1. **Immediately generate new token:**
   ```bash
   NEW_TOKEN=$(openssl rand -hex 32)
   ```

2. **Update .env with new token only:**
   ```bash
   # Directly replace ADMIN_TOKEN
   # Do NOT use dual-token rotation
   ADMIN_TOKEN=new_token_here
   ```

3. **Restart bot immediately:**
   ```bash
   # Force restart (no graceful shutdown)
   pkill -f "npm run dev" || pm2 restart bot
   npm run dev
   ```

4. **Verify old token is rejected:**
   ```bash
   curl -H "Authorization: Bearer old_compromised_token" http://localhost:3000/status
   # Expected: 401 Unauthorized
   ```

5. **Update all clients immediately**

6. **Review access logs:**
   ```bash
   # Check for unauthorized access
   grep "401.*Unauthorized" logs/bot-$(date +%Y%m%d).log
   grep "Authorization.*Bearer" logs/bot-$(date +%Y%m%d).log
   ```

#### PRIVATE_KEY Compromise

**⚠️ CRITICAL:** If private key is compromised, funds are at immediate risk.

1. **Immediately stop the bot:**
   ```bash
   npm run kill
   pkill -f "npm run dev"
   ```

2. **Transfer remaining funds:**
   ```bash
   # Use separate tool or web wallet to transfer funds to new wallet
   # This is time-critical - do NOT delay
   ```

3. **Generate new wallet:**
   ```bash
   # Use secure offline method to generate new wallet
   # Store new private key in KMS immediately
   ```

4. **Update bot configuration with new key:**
   ```bash
   # Update SECRET_SOURCE and related credentials
   # Follow normal private key setup procedures
   ```

5. **Document incident:**
   ```bash
   echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) - CRITICAL: Private key compromise - wallet rotated" >> logs/security-incidents.log
   ```

6. **Post-mortem:**
   - Investigate how key was compromised
   - Review and strengthen security procedures
   - Update incident response procedures

### Secret Backup and Recovery

#### Backup Procedures

1. **Secure backup storage:**
   - Store in encrypted password manager (1Password, LastPass, Bitwarden)
   - Use hardware security key for additional protection
   - Never store in plaintext files

2. **What to backup:**
   ```bash
   # Essential secrets (store separately, never together)
   - PRIVATE_KEY (unencrypted, for emergency recovery)
   - ENCRYPTION_KEY (if using encrypted storage)
   - ADMIN_TOKEN (current active token)
   - AWS/Vault/Azure credentials (if using KMS)
   ```

3. **Backup verification:**
   ```bash
   # Periodically verify backups are accessible and valid
   # Schedule: Monthly
   ```

#### Recovery Procedures

**Scenario: Lost ENCRYPTION_KEY**

1. Retrieve unencrypted PRIVATE_KEY from secure backup
2. Generate new ENCRYPTION_KEY
3. Follow ENCRYPTION_KEY rotation procedure above

**Scenario: Lost ADMIN_TOKEN**

1. If bot is accessible:
   - Generate new token
   - Update .env
   - Restart bot
2. If bot is not accessible:
   - Access server directly
   - Update .env file
   - Restart bot

**Scenario: Lost PRIVATE_KEY (unrecoverable)**

1. Funds in compromised wallet cannot be recovered
2. Generate new wallet
3. Configure bot with new wallet
4. Fund new wallet for trading

### Pre-Rotation Checklist

Before rotating any secret, verify:

- [ ] Backup of current secret is secure and accessible
- [ ] Maintenance window scheduled (if downtime required)
- [ ] All dependent systems identified and documented
- [ ] Rollback procedure understood and tested
- [ ] Monitoring in place to detect issues
- [ ] Team notified of rotation timing
- [ ] Access logs reviewed for suspicious activity

### Post-Rotation Checklist

After rotating any secret, verify:

- [ ] New secret works correctly
- [ ] Old secret is rejected (where applicable)
- [ ] All dependent systems updated
- [ ] No errors in logs
- [ ] Trading functionality verified
- [ ] Rotation documented in operations log
- [ ] New secret backed up securely
- [ ] Old secret securely deleted from all locations

### Rotation Schedule

| Secret Type | Environment | Frequency | Required By |
|-------------|-------------|-----------|-------------|
| ADMIN_TOKEN | All | 30 days | Security best practice |
| ENCRYPTION_KEY | Production | 90 days | Security best practice |
| PRIVATE_KEY | All | On compromise only | Emergency response |
| AWS credentials | Production | 90 days | AWS security best practice |
| Vault token | Production | 90 days | Vault policy |
| Azure credentials | Production | 90 days | Azure security best practice |

### Compliance and Audit

**Logging requirements:**

All secret rotations must be logged with:
- Timestamp (UTC)
- Secret type rotated
- Operator who performed rotation
- Success/failure status
- Any issues encountered

**Log format:**
```
2026-02-18T14:30:00Z - ADMIN_TOKEN rotated successfully by operator@example.com
2026-02-18T14:35:00Z - ENCRYPTION_KEY rotation initiated by operator@example.com
2026-02-18T14:37:00Z - ENCRYPTION_KEY rotation completed successfully
```

**Audit trail:**

Maintain separate security operations log:
```bash
# Create security ops log if it doesn't exist
touch logs/security-ops.log
chmod 600 logs/security-ops.log  # Restrict access

# All secret operations logged here
```

## Support

If you encounter issues:

1. Check this troubleshooting guide
2. Review the ADR document
3. Check the test suite for examples
4. Open an issue on GitHub

**Remember:** Never share your private key, even when asking for help!
