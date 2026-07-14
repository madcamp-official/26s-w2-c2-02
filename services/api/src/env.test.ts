import { describe, expect, it } from 'vitest';
import { parseGeminiApiKeys } from './env';

describe('parseGeminiApiKeys', () => {
  it('accepts comma-separated keys and numbered fallback keys', () => {
    expect(parseGeminiApiKeys('first-key, second-key', 'third-key', undefined)).toEqual([
      'first-key',
      'second-key',
      'third-key'
    ]);
  });

  it('ignores empty key slots', () => {
    expect(parseGeminiApiKeys('', '  ', 'third-key')).toEqual(['third-key']);
  });
});
