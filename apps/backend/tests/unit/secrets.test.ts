import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  validatePrivateKey,
  normalizePrivateKey,
  encryptPrivateKey,
  decryptPrivateKey,
  getPrivateKey,
  loadSecretsConfig,
  type SecretsConfig,
} from '../../src/secrets';

describe('Private Key Validation (Audit Finding A-024)', () => {
  it('validates correct private key without 0x prefix', () => {
    const validKey = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
    expect(validatePrivateKey(validKey)).toBe(true);
  });

  it('validates correct private key with 0x prefix', () => {
    const validKey = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
    expect(validatePrivateKey(validKey)).toBe(true);
  });

  it('rejects private key with wrong length', () => {
    const shortKey = '1234567890abcdef';
    expect(validatePrivateKey(shortKey)).toBe(false);
  });

  it('rejects private key with non-hex characters', () => {
    const invalidKey = 'g234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
    expect(validatePrivateKey(invalidKey)).toBe(false);
  });

  it('rejects empty string', () => {
    expect(validatePrivateKey('')).toBe(false);
  });
});

describe('Private Key Normalization', () => {
  it('adds 0x prefix if missing', () => {
    const key = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
    const normalized = normalizePrivateKey(key);
    expect(normalized).toBe(`0x${key}`);
  });

  it('preserves 0x prefix if present', () => {
    const key = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
    const normalized = normalizePrivateKey(key);
    expect(normalized).toBe(key);
  });

  it('throws error for invalid key', () => {
    const invalidKey = 'invalid';
    expect(() => normalizePrivateKey(invalidKey)).toThrow('Invalid private key format');
  });
});

describe('Encryption and Decryption (Audit Finding A-001)', () => {
  const testPrivateKey = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
  const testPassphrase = 'my-super-secret-passphrase';

  it('encrypts and decrypts successfully', () => {
    const encrypted = encryptPrivateKey(testPrivateKey, testPassphrase);
    
    // Encrypted should be different from original
    expect(encrypted).not.toBe(testPrivateKey);
    
    // Should contain 4 parts (salt:iv:authTag:encrypted)
    expect(encrypted.split(':').length).toBe(4);
    
    // Decrypt should recover original
    const decrypted = decryptPrivateKey(encrypted, testPassphrase);
    expect(decrypted).toBe(testPrivateKey);
  });

  it('produces different ciphertext each time (different salt/IV)', () => {
    const encrypted1 = encryptPrivateKey(testPrivateKey, testPassphrase);
    const encrypted2 = encryptPrivateKey(testPrivateKey, testPassphrase);
    
    expect(encrypted1).not.toBe(encrypted2);
  });

  it('fails to decrypt with wrong passphrase', () => {
    const encrypted = encryptPrivateKey(testPrivateKey, testPassphrase);
    
    expect(() => {
      decryptPrivateKey(encrypted, 'wrong-passphrase');
    }).toThrow('Failed to decrypt private key');
  });

  it('fails to decrypt malformed encrypted data', () => {
    expect(() => {
      decryptPrivateKey('invalid:data', testPassphrase);
    }).toThrow('Invalid encrypted data format');
  });

  it('fails to decrypt with tampered ciphertext', () => {
    const encrypted = encryptPrivateKey(testPrivateKey, testPassphrase);
    const parts = encrypted.split(':');
    // Tamper with the encrypted data
    parts[3] = parts[3].replace('a', 'b');
    const tampered = parts.join(':');
    
    expect(() => {
      decryptPrivateKey(tampered, testPassphrase);
    }).toThrow('Failed to decrypt private key');
  });
});

describe('Get Private Key - Environment Source', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('retrieves private key from environment variable', async () => {
    const testKey = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
    process.env.PRIVATE_KEY = testKey;

    const config: SecretsConfig = {
      source: 'env',
    };

    const result = await getPrivateKey(config);
    expect(result.key).toBe(testKey);
    expect(result.source).toBe('env');
  });

  it('normalizes private key from environment (adds 0x)', async () => {
    const testKey = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
    process.env.PRIVATE_KEY = testKey;

    const config: SecretsConfig = {
      source: 'env',
    };

    const result = await getPrivateKey(config);
    expect(result.key).toBe(`0x${testKey}`);
  });

  it('throws error if PRIVATE_KEY env var not set', async () => {
    delete process.env.PRIVATE_KEY;

    const config: SecretsConfig = {
      source: 'env',
    };

    await expect(getPrivateKey(config)).rejects.toThrow(
      'PRIVATE_KEY environment variable is not set'
    );
  });

  it('throws error if private key is invalid', async () => {
    process.env.PRIVATE_KEY = 'invalid-key';

    const config: SecretsConfig = {
      source: 'env',
    };

    await expect(getPrivateKey(config)).rejects.toThrow(
      'Retrieved private key is invalid'
    );
  });
});

describe('Get Private Key - Encrypted Source', () => {
  const testPrivateKey = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
  const testPassphrase = 'test-passphrase';

  it('retrieves and decrypts private key', async () => {
    const encrypted = encryptPrivateKey(testPrivateKey, testPassphrase);

    const config: SecretsConfig = {
      source: 'encrypted',
      encryptionKey: testPassphrase,
      encryptedPrivateKey: encrypted,
    };

    const result = await getPrivateKey(config);
    expect(result.key).toBe(testPrivateKey);
    expect(result.source).toBe('encrypted');
  });

  it('throws error if encryption key missing', async () => {
    const config: SecretsConfig = {
      source: 'encrypted',
      encryptedPrivateKey: 'some:encrypted:data:here',
    };

    await expect(getPrivateKey(config)).rejects.toThrow(
      'ENCRYPTION_KEY is required for encrypted secret source'
    );
  });

  it('throws error if encrypted private key missing', async () => {
    const config: SecretsConfig = {
      source: 'encrypted',
      encryptionKey: testPassphrase,
    };

    await expect(getPrivateKey(config)).rejects.toThrow(
      'ENCRYPTED_PRIVATE_KEY is required for encrypted secret source'
    );
  });

  it('throws error on decryption failure', async () => {
    const config: SecretsConfig = {
      source: 'encrypted',
      encryptionKey: 'wrong-key',
      encryptedPrivateKey: 'invalid:encrypted:data:here',
    };

    await expect(getPrivateKey(config)).rejects.toThrow();
  });
});

describe('Get Private Key - External KMS (AWS, Vault, Azure)', () => {
  it('throws error for AWS without secret name', async () => {
    const config: SecretsConfig = {
      source: 'aws',
    };

    await expect(getPrivateKey(config)).rejects.toThrow(
      'AWS_SECRET_NAME is required for AWS secret source'
    );
  });

  it('throws error for Vault without required params', async () => {
    const config: SecretsConfig = {
      source: 'vault',
    };

    await expect(getPrivateKey(config)).rejects.toThrow(
      'VAULT_ADDR, VAULT_TOKEN, and VAULT_PATH are required for Vault secret source'
    );
  });

  it('throws error for Azure without required params', async () => {
    const config: SecretsConfig = {
      source: 'azure',
    };

    await expect(getPrivateKey(config)).rejects.toThrow(
      'AZURE_KEY_VAULT_NAME and AZURE_SECRET_NAME are required for Azure secret source'
    );
  });

  it('throws error for unknown source', async () => {
    const config: SecretsConfig = {
      source: 'unknown' as any,
    };

    await expect(getPrivateKey(config)).rejects.toThrow('Unknown secret source: unknown');
  });
});

describe('Load Secrets Config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('loads default config (env source)', () => {
    delete process.env.SECRET_SOURCE;

    const config = loadSecretsConfig();
    expect(config.source).toBe('env');
  });

  it('loads encrypted source config', () => {
    process.env.SECRET_SOURCE = 'encrypted';
    process.env.ENCRYPTION_KEY = 'my-key';
    process.env.ENCRYPTED_PRIVATE_KEY = 'encrypted:data';

    const config = loadSecretsConfig();
    expect(config.source).toBe('encrypted');
    expect(config.encryptionKey).toBe('my-key');
    expect(config.encryptedPrivateKey).toBe('encrypted:data');
  });

  it('loads AWS source config', () => {
    process.env.SECRET_SOURCE = 'aws';
    process.env.AWS_SECRET_NAME = 'my-secret';
    process.env.AWS_REGION = 'us-west-2';

    const config = loadSecretsConfig();
    expect(config.source).toBe('aws');
    expect(config.awsSecretName).toBe('my-secret');
    expect(config.awsRegion).toBe('us-west-2');
  });

  it('loads Vault source config', () => {
    process.env.SECRET_SOURCE = 'vault';
    process.env.VAULT_ADDR = 'https://vault.example.com';
    process.env.VAULT_TOKEN = 'my-token';
    process.env.VAULT_PATH = 'secret/polymarket';

    const config = loadSecretsConfig();
    expect(config.source).toBe('vault');
    expect(config.vaultAddr).toBe('https://vault.example.com');
    expect(config.vaultToken).toBe('my-token');
    expect(config.vaultPath).toBe('secret/polymarket');
  });

  it('loads Azure source config', () => {
    process.env.SECRET_SOURCE = 'azure';
    process.env.AZURE_KEY_VAULT_NAME = 'my-keyvault';
    process.env.AZURE_SECRET_NAME = 'polymarket-key';

    const config = loadSecretsConfig();
    expect(config.source).toBe('azure');
    expect(config.azureKeyVaultName).toBe('my-keyvault');
    expect(config.azureSecretName).toBe('polymarket-key');
  });
});
