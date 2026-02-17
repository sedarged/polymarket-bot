import { beforeEach, describe, expect, it, vi } from 'vitest';

const sendMock = vi.fn();

vi.mock('@aws-sdk/client-secrets-manager', () => {
  return {
    SecretsManagerClient: vi.fn().mockImplementation(() => ({
      send: sendMock,
    })),
    GetSecretValueCommand: vi.fn().mockImplementation((input: any) => ({
      input,
    })),
  };
});

import { getPrivateKey, getPrivateKeyFromAWS } from '../../src/secrets';

describe('AWS Secrets Manager secret backend', () => {
  beforeEach(() => {
    sendMock.mockReset();
  });

  it('reads private key stored directly as SecretString', async () => {
    const key = `0x${'a'.repeat(64)}`;
    sendMock.mockResolvedValueOnce({ SecretString: key });

    await expect(getPrivateKeyFromAWS('my-secret', 'us-east-1')).resolves.toBe(key);
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        input: { SecretId: 'my-secret' },
      }),
    );
  });

  it('reads private key from JSON SecretString via getPrivateKey()', async () => {
    const keyNoPrefix = 'b'.repeat(64);
    sendMock.mockResolvedValueOnce({
      SecretString: JSON.stringify({ privateKey: keyNoPrefix }),
    });

    const result = await getPrivateKey({
      source: 'aws',
      awsSecretName: 'my-secret',
      awsRegion: 'us-east-1',
    });

    expect(result.source).toBe('aws');
    expect(result.key).toBe(`0x${keyNoPrefix}`);
  });

  it('propagates AWS SDK errors', async () => {
    sendMock.mockRejectedValueOnce(new Error('AccessDenied'));

    await expect(getPrivateKeyFromAWS('my-secret', 'us-east-1')).rejects.toThrow('AccessDenied');
  });

  it('throws when secret value is empty', async () => {
    sendMock.mockResolvedValueOnce({});

    await expect(getPrivateKeyFromAWS('my-secret', 'us-east-1')).rejects.toThrow(
      'Secret value is empty',
    );
  });
});

