import { describe, expect, it } from 'vitest';
import { isAllowedClientOrigin } from './env';

describe('isAllowedClientOrigin', () => {
  it('allows local renderer origins used during development', () => {
    expect(isAllowedClientOrigin('http://localhost:5175')).toBe(true);
    expect(isAllowedClientOrigin('http://127.0.0.1:5175')).toBe(true);
  });

  it('allows private LAN renderer origins used by shared desktop demos', () => {
    expect(isAllowedClientOrigin('http://192.168.0.23:5175')).toBe(true);
    expect(isAllowedClientOrigin('http://10.0.0.12:5175')).toBe(true);
    expect(isAllowedClientOrigin('http://172.16.4.9:5175')).toBe(true);
    expect(isAllowedClientOrigin('http://172.31.4.9:5175')).toBe(true);
  });

  it('allows packaged Electron origins', () => {
    expect(isAllowedClientOrigin('null')).toBe(true);
    expect(isAllowedClientOrigin('file://')).toBe(true);
  });

  it('rejects unrelated public origins by default', () => {
    expect(isAllowedClientOrigin('http://203.0.113.10:5175')).toBe(false);
    expect(isAllowedClientOrigin('https://example.com')).toBe(false);
  });
});
