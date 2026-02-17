import { beforeEach, describe, expect, it, vi } from 'vitest';

const readMock = vi.fn();

vi.mock('node-vault', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      read: readMock,
    })),
  };
});

import { getPrivateKey, getPrivateKeyFromVault } from '../../src/secrets';

describe('HashiCorp Vault secret backend', () => {
  beforeEach(() => {
    readMock.mockReset();
  });

  it('reads private key from KV v1 response shape', async () => {
    const key = `0x${'e'.repeat(64)}`;
    readMock.mockResolvedValueOnce({
      data: { privateKey: key },
    });

    await expect(
      getPrivateKeyFromVault('https://vault.example.com', 'token', 'secret/polymarket'),
    ).resolves.toBe(key);
  });

  it('reads private key from KV v2 response shape and normalizes via getPrivateKey()', async () => {
    const keyNoPrefix = 'f'.repeat(64);
    readMock.mockResolvedValueOnce({
      data: { data: { private_key: keyNoPrefix } },
    });

    const result = await getPrivateKey({
      source: 'vault',
      vaultAddr: 'https://vault.example.com',
      vaultToken: 'token',
      vaultPath: 'secret/data/polymarket',
    });

    expect(result.source).toBe('vault');
    expect(result.key).toBe(`0x${keyNoPrefix}`);
  });

  it('propagates Vault client errors', async () => {
    readMock.mockRejectedValueOnce(new Error('permission denied'));

    await expect(
      getPrivateKeyFromVault('https://vault.example.com', 'token', 'secret/polymarket'),
    ).rejects.toThrow('permission denied');
  });
});

