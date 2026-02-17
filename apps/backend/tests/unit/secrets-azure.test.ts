import { beforeEach, describe, expect, it, vi } from 'vitest';

const getSecretMock = vi.fn();

vi.mock('@azure/identity', () => {
  return {
    DefaultAzureCredential: vi.fn().mockImplementation(function (this: any) {}),
  };
});

vi.mock('@azure/keyvault-secrets', () => {
  return {
    SecretClient: vi.fn().mockImplementation(function (this: any) {
      this.getSecret = getSecretMock;
    }),
  };
});

import { getPrivateKey, getPrivateKeyFromAzure } from '../../src/secrets';

describe('Azure Key Vault secret backend', () => {
  beforeEach(() => {
    getSecretMock.mockReset();
  });

  it('reads private key from Azure Key Vault secret', async () => {
    const key = `0x${'c'.repeat(64)}`;
    getSecretMock.mockResolvedValueOnce({ value: key });

    await expect(getPrivateKeyFromAzure('my-kv', 'polymarket-private-key')).resolves.toBe(key);
  });

  it('normalizes key via getPrivateKey() (adds 0x prefix)', async () => {
    const keyNoPrefix = 'd'.repeat(64);
    getSecretMock.mockResolvedValueOnce({ value: keyNoPrefix });

    const result = await getPrivateKey({
      source: 'azure',
      azureKeyVaultName: 'my-kv',
      azureSecretName: 'polymarket-private-key',
    });

    expect(result.source).toBe('azure');
    expect(result.key).toBe(`0x${keyNoPrefix}`);
  });

  it('throws when secret value is empty', async () => {
    getSecretMock.mockResolvedValueOnce({ value: '   ' });

    await expect(getPrivateKeyFromAzure('my-kv', 'polymarket-private-key')).rejects.toThrow(
      'Secret value is empty',
    );
  });
});

