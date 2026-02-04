# Security Guide - Private Key Management

This guide explains how to securely manage your wallet private key for the Polymarket trading bot.

**Addresses:** Audit Finding A-001 (CRITICAL) - Plaintext Private Key Storage

## Table of Contents

1. [Overview](#overview)
2. [Security Levels](#security-levels)
3. [Setup Methods](#setup-methods)
4. [Encryption Tool](#encryption-tool)
5. [Production Setup](#production-setup)
6. [Security Best Practices](#security-best-practices)
7. [Troubleshooting](#troubleshooting)

## Overview

The trading bot requires your wallet private key to sign transactions. This guide provides multiple methods for storing this sensitive credential, ranging from basic (for development) to enterprise-grade (for production).

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

### Error: "AWS Secrets Manager integration not implemented"

**Solution:** Install AWS SDK dependencies (not included by default to keep deployment lightweight).

```bash
npm install @aws-sdk/client-secrets-manager
```

Then uncomment the AWS integration code in `apps/backend/src/secrets/index.ts`.

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

- [ADR-0005: Secrets Management](../adr/0005-secrets-management.md)
- [Audit Finding A-001](../../REPORTS/AUDIT.md#a-001-critical---plaintext-private-key-storage)
- [OWASP Secrets Management](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)
- [AWS Secrets Manager Best Practices](https://docs.aws.amazon.com/secretsmanager/latest/userguide/best-practices.html)
- [HashiCorp Vault Documentation](https://www.vaultproject.io/docs)
- [Azure Key Vault Best Practices](https://docs.microsoft.com/azure/key-vault/general/best-practices)

## Support

If you encounter issues:

1. Check this troubleshooting guide
2. Review the ADR document
3. Check the test suite for examples
4. Open an issue on GitHub

**Remember:** Never share your private key, even when asking for help!
