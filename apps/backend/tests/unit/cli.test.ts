import { describe, it, expect } from 'vitest';
import { parseArgs } from '../../src/cli';

describe('CLI Argument Parsing', () => {
  it('should parse markets command', () => {
    const { command, options } = parseArgs(['markets']);
    
    expect(command).toBe('markets');
    expect(options).toEqual({});
  });

  it('should parse markets command with limit', () => {
    const { command, options } = parseArgs(['markets', '--limit', '5']);
    
    expect(command).toBe('markets');
    expect(options).toEqual({ limit: '5' });
  });

  it('should parse book command with tokenId', () => {
    const { command, options } = parseArgs(['book', '--tokenId', 'abc123']);
    
    expect(command).toBe('book');
    expect(options).toEqual({ tokenId: 'abc123' });
  });

  it('should parse boolean flags', () => {
    const { command, options } = parseArgs(['test', '--verbose']);
    
    expect(command).toBe('test');
    expect(options).toEqual({ verbose: true });
  });

  it('should parse multiple options', () => {
    const { command, options } = parseArgs(['markets', '--limit', '10', '--format', 'json']);
    
    expect(command).toBe('markets');
    expect(options).toEqual({ limit: '10', format: 'json' });
  });
});
