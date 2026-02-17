import { beforeEach, describe, expect, it, vi } from 'vitest';

const sendMock = vi.fn();

vi.mock('@aws-sdk/client-secrets-manager', () => {
  return {
    SecretsManagerClient: vi.fn().mockImplementation(function (this: any) {
      this.send = sendMock;
    }),
    GetSecretValueCommand: vi.fn().mockImplementation(function (this: any, input: any) {
      this.input = input;
    }),
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

  it('reads PRIVATE_KEY JSON field via getPrivateKey()', async () => {
    const keyNoPrefix = 'c'.repeat(64);
    sendMock.mockResolvedValueOnce({
      SecretString: JSON.stringify({ PRIVATE_KEY: keyNoPrefix }),
    });

    const result = await getPrivateKey({
      source: 'aws',
      awsSecretName: 'my-secret',
      awsRegion: 'us-east-1',
    });

    expect(result.source).toBe('aws');
    expect(result.key).toBe(`0x${keyNoPrefix}`);
  });

  it('reads private_key JSON field via getPrivateKey()', async () => {
    const keyNoPrefix = 'd'.repeat(64);
    sendMock.mockResolvedValueOnce({
      SecretString: JSON.stringify({ private_key: keyNoPrefix }),
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

  it('reads private key stored as SecretBinary', async () => {
    const key = `0x${'e'.repeat(64)}`;
    // Simulate AWS Secrets Manager returning the private key in SecretBinary form
    sendMock.mockResolvedValueOnce({
      SecretBinary: Buffer.from(key, 'utf8'),
    });

    await expect(getPrivateKeyFromAWS('my-secret', 'us-east-1')).resolves.toBe(key);
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        input: { SecretId: 'my-secret' },
      }),
    );
  });

  it('rejects invalid private key format returned directly from AWS', async () => {
    // Too short and therefore invalid private key
    const invalidKey = '0x1234';
    sendMock.mockResolvedValueOnce({ SecretString: invalidKey });

    await expect(getPrivateKeyFromAWS('my-secret', 'us-east-1')).rejects.toThrow();
  });

  it('rejects invalid private key format returned in JSON SecretString', async () => {
    const invalidKeyNoPrefix = 'not-a-valid-hex-key';
    sendMock.mockResolvedValueOnce({
      SecretString: JSON.stringify({ privateKey: invalidKeyNoPrefix }),
    });

    await expect(
      getPrivateKey({
        source: 'aws',
        awsSecretName: 'my-secret',
        awsRegion: 'us-east-1',
      }),
    ).rejects.toThrow();
  });
});

