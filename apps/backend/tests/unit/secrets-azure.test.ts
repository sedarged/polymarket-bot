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

  it('reads private key from JSON with privateKey field', async () => {
    const keyNoPrefix = 'e'.repeat(64);
    getSecretMock.mockResolvedValueOnce({
      value: JSON.stringify({ privateKey: keyNoPrefix }),
    });

    const result = await getPrivateKey({
      source: 'azure',
      azureKeyVaultName: 'my-kv',
      azureSecretName: 'polymarket-private-key',
    });

    expect(result.source).toBe('azure');
    expect(result.key).toBe(`0x${keyNoPrefix}`);
  });

  it('reads private key from JSON with PRIVATE_KEY field', async () => {
    const keyNoPrefix = 'f'.repeat(64);
    getSecretMock.mockResolvedValueOnce({
      value: JSON.stringify({ PRIVATE_KEY: keyNoPrefix }),
    });

    const result = await getPrivateKey({
      source: 'azure',
      azureKeyVaultName: 'my-kv',
      azureSecretName: 'polymarket-private-key',
    });

    expect(result.source).toBe('azure');
    expect(result.key).toBe(`0x${keyNoPrefix}`);
  });

  it('reads private key from JSON with private_key field', async () => {
    const keyNoPrefix = '1'.repeat(64);
    getSecretMock.mockResolvedValueOnce({
      value: JSON.stringify({ private_key: keyNoPrefix }),
    });

    const result = await getPrivateKey({
      source: 'azure',
      azureKeyVaultName: 'my-kv',
      azureSecretName: 'polymarket-private-key',
    });

    expect(result.source).toBe('azure');
    expect(result.key).toBe(`0x${keyNoPrefix}`);
  });

  it('throws if JSON does not contain a private key field', async () => {
    getSecretMock.mockResolvedValueOnce({
      value: JSON.stringify({ someOtherField: 'not-a-key' }),
    });

    await expect(
      getPrivateKey({
        source: 'azure',
        azureKeyVaultName: 'my-kv',
        azureSecretName: 'polymarket-private-key',
      }),
    ).rejects.toThrow(/private.*key/i);
  });

  it('rejects invalid private key format in JSON', async () => {
    getSecretMock.mockResolvedValueOnce({
      value: JSON.stringify({ privateKey: 'invalid-key' }),
    });

    await expect(
      getPrivateKey({
        source: 'azure',
        azureKeyVaultName: 'my-kv',
        azureSecretName: 'polymarket-private-key',
      }),
    ).rejects.toThrow();
  });
});

