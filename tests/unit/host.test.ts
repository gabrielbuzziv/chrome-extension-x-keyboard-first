import { describe, expect, it } from 'vitest';
import { isSupportedXHost } from '../../src/shared/host';

describe('isSupportedXHost', () => {
  it('accepts x.com urls', () => {
    expect(isSupportedXHost('https://x.com/home')).toBe(true);
  });

  it('rejects twitter.com urls', () => {
    expect(isSupportedXHost('https://twitter.com/home')).toBe(false);
  });

  it('rejects local fixture urls', () => {
    expect(isSupportedXHost('http://127.0.0.1:4173/timeline')).toBe(false);
  });

  it('rejects invalid urls', () => {
    expect(isSupportedXHost('not-a-url')).toBe(false);
  });
});
