import { describe, expect, it } from 'vitest';
import { normalizeShutdownExitCode } from '../../src/server';

describe('normalizeShutdownExitCode', () => {
  it('returns explicit numeric exit code unchanged', () => {
    expect(normalizeShutdownExitCode(0, 1)).toBe(0);
    expect(normalizeShutdownExitCode(2, 1)).toBe(2);
  });

  it('falls back to provided default for process signal values', () => {
    expect(normalizeShutdownExitCode('SIGTERM', 0)).toBe(0);
    expect(normalizeShutdownExitCode('SIGINT', 1)).toBe(1);
  });

  it('falls back to provided default for undefined values', () => {
    expect(normalizeShutdownExitCode(undefined, 0)).toBe(0);
    expect(normalizeShutdownExitCode(undefined, 1)).toBe(1);
  });
});
