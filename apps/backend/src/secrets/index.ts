/**
 * Secrets Management Module
 * 
 * Addresses Audit Finding A-001: Plaintext Private Key Storage
 * 
 * This module provides secure storage and retrieval of sensitive credentials
 * (primarily the wallet private key) with support for multiple backends:
 * 
 * 1. **Environment Variable** (default, least secure)
 *    - Direct access from process.env
 *    - Only recommended for local development
 *    - Must use strong OS-level protections
 * 
 * 2. **Encrypted Local Storage** (improved security)
 *    - Private key encrypted with AES-256-GCM
 *    - Requires passphrase in environment
 *    - Suitable for single-server deployments
 * 
 * 3. **External Secret Managers** (production recommended)
 *    - AWS Secrets Manager
 *    - HashiCorp Vault
 *    - Azure Key Vault
 *    - Centralized secret management with audit logs
 * 
 * Configuration via environment variables:
 * - SECRET_SOURCE: 'env' | 'encrypted' | 'aws' | 'vault' | 'azure'
 * - For encrypted: ENCRYPTION_KEY (passphrase)
 * - For AWS: AWS_SECRET_NAME, AWS_REGION
 * - For Vault: VAULT_ADDR, VAULT_TOKEN, VAULT_PATH
 * - For Azure: AZURE_KEY_VAULT_NAME, AZURE_SECRET_NAME
 */

import crypto from 'crypto';
import { z } from 'zod';

/**
 * Supported secret storage backends
 */
export type SecretSource = 'env' | 'encrypted' | 'aws' | 'vault' | 'azure';

/**
 * Configuration for secret management
 */
export interface SecretsConfig {
  source: SecretSource;
  // For 'encrypted' source
  encryptionKey?: string;
  encryptedPrivateKey?: string;
  // For 'aws' source
  awsSecretName?: string;
  awsRegion?: string;
  // For 'vault' source
  vaultAddr?: string;
  vaultToken?: string;
  vaultPath?: string;
  // For 'azure' source
  azureKeyVaultName?: string;
  azureSecretName?: string;
}

/**
 * Result of private key retrieval
 */
export interface PrivateKeyResult {
  key: string;
  source: SecretSource;
}

/**
 * Validates that a string is a valid Ethereum private key
 * Must be 64 hex characters (optionally prefixed with 0x)
 */
export const validatePrivateKey = (key: string): boolean => {
  const privateKeySchema = z.string().regex(
    /^(0x)?[0-9a-fA-F]{64}$/,
    'Private key must be 64 hexadecimal characters (optionally prefixed with 0x)'
  );
  
  return privateKeySchema.safeParse(key).success;
};

/**
 * Normalizes a private key to include the 0x prefix
 */
export const normalizePrivateKey = (key: string): string => {
  if (!validatePrivateKey(key)) {
    throw new Error('Invalid private key format');
  }
  
  return key.startsWith('0x') ? key : `0x${key}`;
};

/**
 * Encrypts a private key using AES-256-GCM
 * 
 * @param privateKey - The private key to encrypt
 * @param passphrase - The passphrase for encryption
 * @returns Base64-encoded encrypted data (format: iv:authTag:encryptedData)
 */
export const encryptPrivateKey = (privateKey: string, passphrase: string): string => {
  // Derive a 32-byte key from the passphrase using PBKDF2
  const salt = crypto.randomBytes(16);
  const key = crypto.pbkdf2Sync(passphrase, salt, 100000, 32, 'sha256');
  
  // Generate a random IV
  const iv = crypto.randomBytes(16);
  
  // Encrypt using AES-256-GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  
  let encrypted = cipher.update(privateKey, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  
  // Format: salt:iv:authTag:encryptedData (all hex-encoded)
  return `${salt.toString('hex')}:${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
};

/**
 * Decrypts a private key encrypted with encryptPrivateKey
 * 
 * @param encryptedData - The encrypted data string
 * @param passphrase - The passphrase for decryption
 * @returns The decrypted private key
 * @throws Error if decryption fails
 */
export const decryptPrivateKey = (encryptedData: string, passphrase: string): string => {
  try {
    // Parse the encrypted data
    const parts = encryptedData.split(':');
    if (parts.length !== 4) {
      throw new Error('Invalid encrypted data format');
    }
    
    const [saltHex, ivHex, authTagHex, encrypted] = parts;
    
    const salt = Buffer.from(saltHex, 'hex');
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    
    // Derive the same key from passphrase and salt
    const key = crypto.pbkdf2Sync(passphrase, salt, 100000, 32, 'sha256');
    
    // Decrypt
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    throw new Error(
      `Failed to decrypt private key: ${error instanceof Error ? error.message : String(error)}`
    );
  }
};

/**
 * Retrieves private key from AWS Secrets Manager
 * 
 * @param secretName - Name of the secret in AWS Secrets Manager
 * @param region - AWS region (defaults to us-east-1)
 * @returns The private key
 */
export const getPrivateKeyFromAWS = async (
  _secretName: string,
  _region: string = 'us-east-1'
): Promise<string> => {
  // This is a placeholder for AWS Secrets Manager integration
  // In production, this would use the AWS SDK:
  // import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
  
  throw new Error(
    'AWS Secrets Manager integration not implemented. ' +
    'To implement: npm install @aws-sdk/client-secrets-manager and uncomment the integration code.'
  );
  
  // Example implementation (commented out to avoid adding dependency):
  // const client = new SecretsManagerClient({ region });
  // const command = new GetSecretValueCommand({ SecretId: secretName });
  // const response = await client.send(command);
  // const secret = JSON.parse(response.SecretString || '{}');
  // return secret.privateKey || secret.PRIVATE_KEY;
};

/**
 * Retrieves private key from HashiCorp Vault
 * 
 * @param vaultAddr - Vault server address
 * @param vaultToken - Vault authentication token
 * @param vaultPath - Path to the secret (e.g., 'secret/data/polymarket')
 * @returns The private key
 */
export const getPrivateKeyFromVault = async (
  _vaultAddr: string,
  _vaultToken: string,
  _vaultPath: string
): Promise<string> => {
  // This is a placeholder for HashiCorp Vault integration
  // In production, this would use the Vault API or node-vault client
  
  throw new Error(
    'HashiCorp Vault integration not implemented. ' +
    'To implement: npm install node-vault and uncomment the integration code.'
  );
  
  // Example implementation (commented out to avoid adding dependency):
  // import vault from 'node-vault';
  // const client = vault({ apiVersion: 'v1', endpoint: vaultAddr, token: vaultToken });
  // const result = await client.read(vaultPath);
  // return result.data.data.privateKey || result.data.data.PRIVATE_KEY;
};

/**
 * Retrieves private key from Azure Key Vault
 * 
 * @param keyVaultName - Name of the Azure Key Vault
 * @param secretName - Name of the secret
 * @returns The private key
 */
export const getPrivateKeyFromAzure = async (
  _keyVaultName: string,
  _secretName: string
): Promise<string> => {
  // This is a placeholder for Azure Key Vault integration
  // In production, this would use the Azure SDK:
  // import { SecretClient } from "@azure/keyvault-secrets";
  // import { DefaultAzureCredential } from "@azure/identity";
  
  throw new Error(
    'Azure Key Vault integration not implemented. ' +
    'To implement: npm install @azure/keyvault-secrets @azure/identity and uncomment the integration code.'
  );
  
  // Example implementation (commented out to avoid adding dependency):
  // const credential = new DefaultAzureCredential();
  // const url = `https://${keyVaultName}.vault.azure.net`;
  // const client = new SecretClient(url, credential);
  // const secret = await client.getSecret(secretName);
  // return secret.value || '';
};

/**
 * Main function to retrieve private key based on configured source
 * 
 * @param config - Configuration for secret retrieval
 * @returns PrivateKeyResult containing the key and its source
 * @throws Error if retrieval fails or configuration is invalid
 */
export const getPrivateKey = async (config: SecretsConfig): Promise<PrivateKeyResult> => {
  let privateKey: string;
  
  switch (config.source) {
    case 'env': {
      // Direct environment variable access (least secure)
      privateKey = process.env.PRIVATE_KEY || '';
      
      if (!privateKey) {
        throw new Error('PRIVATE_KEY environment variable is not set');
      }
      
      break;
    }
    
    case 'encrypted': {
      // Encrypted local storage
      if (!config.encryptionKey) {
        throw new Error('ENCRYPTION_KEY is required for encrypted secret source');
      }
      
      if (!config.encryptedPrivateKey) {
        throw new Error('ENCRYPTED_PRIVATE_KEY is required for encrypted secret source');
      }
      
      privateKey = decryptPrivateKey(config.encryptedPrivateKey, config.encryptionKey);
      break;
    }
    
    case 'aws': {
      // AWS Secrets Manager
      if (!config.awsSecretName) {
        throw new Error('AWS_SECRET_NAME is required for AWS secret source');
      }
      
      privateKey = await getPrivateKeyFromAWS(
        config.awsSecretName,
        config.awsRegion || 'us-east-1'
      );
      break;
    }
    
    case 'vault': {
      // HashiCorp Vault
      if (!config.vaultAddr || !config.vaultToken || !config.vaultPath) {
        throw new Error('VAULT_ADDR, VAULT_TOKEN, and VAULT_PATH are required for Vault secret source');
      }
      
      privateKey = await getPrivateKeyFromVault(
        config.vaultAddr,
        config.vaultToken,
        config.vaultPath
      );
      break;
    }
    
    case 'azure': {
      // Azure Key Vault
      if (!config.azureKeyVaultName || !config.azureSecretName) {
        throw new Error('AZURE_KEY_VAULT_NAME and AZURE_SECRET_NAME are required for Azure secret source');
      }
      
      privateKey = await getPrivateKeyFromAzure(
        config.azureKeyVaultName,
        config.azureSecretName
      );
      break;
    }
    
    default: {
      throw new Error(`Unknown secret source: ${config.source}`);
    }
  }
  
  // Validate the retrieved private key
  if (!validatePrivateKey(privateKey)) {
    throw new Error(
      `Retrieved private key is invalid. Expected 64 hex characters (optionally prefixed with 0x). ` +
      `Source: ${config.source}`
    );
  }
  
  // Normalize to include 0x prefix
  privateKey = normalizePrivateKey(privateKey);
  
  return {
    key: privateKey,
    source: config.source,
  };
};

/**
 * Loads secrets configuration from environment variables
 */
export const loadSecretsConfig = (): SecretsConfig => {
  const source = (process.env.SECRET_SOURCE || 'env') as SecretSource;
  
  return {
    source,
    // Encrypted source
    encryptionKey: process.env.ENCRYPTION_KEY,
    encryptedPrivateKey: process.env.ENCRYPTED_PRIVATE_KEY,
    // AWS source
    awsSecretName: process.env.AWS_SECRET_NAME,
    awsRegion: process.env.AWS_REGION,
    // Vault source
    vaultAddr: process.env.VAULT_ADDR,
    vaultToken: process.env.VAULT_TOKEN,
    vaultPath: process.env.VAULT_PATH,
    // Azure source
    azureKeyVaultName: process.env.AZURE_KEY_VAULT_NAME,
    azureSecretName: process.env.AZURE_SECRET_NAME,
  };
};
