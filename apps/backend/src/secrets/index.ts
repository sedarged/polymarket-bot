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
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { DefaultAzureCredential } from '@azure/identity';
import { SecretClient } from '@azure/keyvault-secrets';
import vault from 'node-vault';
import { z } from 'zod';
import { systemLogger } from '../utils/logger';

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
 * @returns Base64-encoded encrypted data (format: salt:iv:authTag:encryptedData)
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

const SECRET_FIELD_CANDIDATES = [
  'privateKey',
  'PRIVATE_KEY',
  'private_key',
] as const;

const safeJsonParse = (value: string): unknown => {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
};

const extractPrivateKeyFromUnknown = (data: unknown): string | undefined => {
  if (typeof data === 'string') {
    return data;
  }

  if (!data || typeof data !== 'object') {
    return undefined;
  }

  const record = data as Record<string, unknown>;

  for (const field of SECRET_FIELD_CANDIDATES) {
    const candidate = record[field];
    if (typeof candidate === 'string') {
      return candidate;
    }
  }

  return undefined;
};

/**
 * Retrieves private key from AWS Secrets Manager
 * 
 * @param secretName - Name of the secret in AWS Secrets Manager
 * @param region - AWS region (defaults to us-east-1)
 * @returns The private key
 */
export const getPrivateKeyFromAWS = async (
  secretName: string,
  region: string = 'us-east-1'
): Promise<string> => {
  const client = new SecretsManagerClient({ region });

  try {
    const response = await client.send(
      new GetSecretValueCommand({
        SecretId: secretName,
      })
    );

    const rawSecretString =
      typeof response.SecretString === 'string' && response.SecretString.trim().length > 0
        ? response.SecretString
        : undefined;

    const rawSecretBinary =
      response.SecretBinary && (response.SecretBinary as any).length
        ? Buffer.from(response.SecretBinary as any).toString('utf8')
        : undefined;

    const secretPayload = rawSecretString ?? rawSecretBinary;

    if (!secretPayload) {
      throw new Error('Secret value is empty (SecretString/SecretBinary missing)');
    }

    const trimmed = secretPayload.trim();

    // Support storing the private key directly as the secret value.
    if (validatePrivateKey(trimmed)) {
      const normalized = normalizePrivateKey(trimmed);
      systemLogger.info('Private key retrieved from AWS Secrets Manager', {
        audit: 'A-001',
        region,
        secretName,
        secretFormat: 'string',
        source: 'aws',
      });
      return normalized;
    }

    const parsed = safeJsonParse(trimmed);
    if (!parsed) {
      throw new Error(
        'AWS secret value must be a private key string or JSON containing one of: ' +
          SECRET_FIELD_CANDIDATES.join(', ')
      );
    }

    const extracted = extractPrivateKeyFromUnknown(parsed);
    if (!extracted) {
      throw new Error(
        'Private key not found in AWS secret JSON. Expected field: ' +
          SECRET_FIELD_CANDIDATES.join(', ')
      );
    }

    // Validate and normalize the extracted key
    const trimmedExtracted = extracted.trim();
    if (!validatePrivateKey(trimmedExtracted)) {
      throw new Error(
        `Invalid private key format in AWS secret. Expected 64 hex characters (optionally prefixed with 0x)`
      );
    }
    const normalized = normalizePrivateKey(trimmedExtracted);

    systemLogger.info('Private key retrieved from AWS Secrets Manager', {
      audit: 'A-001',
      region,
      secretName,
      secretFormat: 'json',
      source: 'aws',
    });

    return normalized;
  } catch (error) {
    systemLogger.error('Failed to retrieve private key from AWS Secrets Manager', {
      region,
      secretName,
      source: 'aws',
      error: error instanceof Error ? error.message : String(error),
      errorName: (error as any)?.name,
    });
    throw error;
  }
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
  vaultAddr: string,
  vaultToken: string,
  vaultPath: string
): Promise<string> => {
  const client = vault({
    apiVersion: 'v1',
    endpoint: vaultAddr,
    token: vaultToken,
  }) as any;

  try {
    const response = await client.read(vaultPath);

    // node-vault response shape differs between KV v1 and KV v2.
    // - KV v1: { data: { privateKey: '0x...' } }
    // - KV v2: { data: { data: { privateKey: '0x...' }, metadata: {...} } }
    const direct = extractPrivateKeyFromUnknown(response?.data);
    const nested = extractPrivateKeyFromUnknown(response?.data?.data);

    const extracted = direct ?? nested;

    if (!extracted) {
      throw new Error(
        'Private key not found in Vault secret. Expected field: ' +
          SECRET_FIELD_CANDIDATES.join(', ') +
          ' (KV v1) or under data.data (KV v2)'
      );
    }

    // Validate and normalize the extracted key
    const trimmedExtracted = extracted.trim();
    if (!validatePrivateKey(trimmedExtracted)) {
      throw new Error(
        `Invalid private key format in Vault secret. Expected 64 hex characters (optionally prefixed with 0x)`
      );
    }
    const normalized = normalizePrivateKey(trimmedExtracted);

    systemLogger.info('Private key retrieved from HashiCorp Vault', {
      audit: 'A-001',
      source: 'vault',
      vaultAddr,
      vaultPath,
    });

    return normalized;
  } catch (error) {
    systemLogger.error('Failed to retrieve private key from HashiCorp Vault', {
      source: 'vault',
      vaultAddr,
      vaultPath,
      error: error instanceof Error ? error.message : String(error),
      errorName: (error as any)?.name,
    });
    throw error;
  }
};

/**
 * Retrieves private key from Azure Key Vault
 * 
 * @param keyVaultName - Name of the Azure Key Vault
 * @param secretName - Name of the secret
 * @returns The private key
 */
export const getPrivateKeyFromAzure = async (
  keyVaultName: string,
  secretName: string
): Promise<string> => {
  const vaultUrl = keyVaultName.startsWith('https://')
    ? keyVaultName
    : `https://${keyVaultName}.vault.azure.net`;

  const credential = new DefaultAzureCredential();
  const client = new SecretClient(vaultUrl, credential);

  try {
    const secret = await client.getSecret(secretName);
    const value = secret.value?.trim();

    if (!value) {
      throw new Error('Secret value is empty');
    }

    // Support storing the private key directly as the secret value.
    if (validatePrivateKey(value)) {
      const normalized = normalizePrivateKey(value);
      systemLogger.info('Private key retrieved from Azure Key Vault', {
        audit: 'A-001',
        source: 'azure',
        keyVaultName,
        secretName,
        secretFormat: 'string',
      });
      return normalized;
    }

    // Try parsing as JSON and extract the private key from known field names
    const parsed = safeJsonParse(value);
    if (!parsed) {
      throw new Error(
        'Azure secret value must be a private key string or JSON containing one of: ' +
          SECRET_FIELD_CANDIDATES.join(', ')
      );
    }

    const extracted = extractPrivateKeyFromUnknown(parsed);
    if (!extracted) {
      throw new Error(
        'Private key not found in Azure secret JSON. Expected field: ' +
          SECRET_FIELD_CANDIDATES.join(', ')
      );
    }

    // Validate and normalize the extracted key
    const trimmedExtracted = extracted.trim();
    if (!validatePrivateKey(trimmedExtracted)) {
      throw new Error(
        `Invalid private key format in Azure secret. Expected 64 hex characters (optionally prefixed with 0x)`
      );
    }
    const normalized = normalizePrivateKey(trimmedExtracted);

    systemLogger.info('Private key retrieved from Azure Key Vault', {
      audit: 'A-001',
      source: 'azure',
      keyVaultName,
      secretName,
      secretFormat: 'json',
    });

    return normalized;
  } catch (error) {
    systemLogger.error('Failed to retrieve private key from Azure Key Vault', {
      source: 'azure',
      keyVaultName,
      secretName,
      error: error instanceof Error ? error.message : String(error),
      errorName: (error as any)?.name,
    });
    throw error;
  }
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
