import { describe, it, expect, beforeEach } from 'vitest';
import { SELECTORS, queryFirst, queryAll } from '../../src/shared/selectors';

describe('selectors', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('queryFirst returns primary match', () => {
    document.body.innerHTML = '<article data-testid="tweet" id="p"></article>';
    expect(queryFirst(SELECTORS.TWEET)?.id).toBe('p');
  });

  it('queryFirst falls back when primary misses', () => {
    document.body.innerHTML = '<article role="article" id="f"></article>';
    expect(queryFirst(SELECTORS.TWEET)?.id).toBe('f');
  });

  it('queryFirst returns null when neither matches', () => {
    document.body.innerHTML = '<div></div>';
    expect(queryFirst(SELECTORS.TWEET)).toBeNull();
  });

  it('queryAll returns primary matches', () => {
    document.body.innerHTML =
      '<article data-testid="tweet"></article><article data-testid="tweet"></article>';
    expect(queryAll(SELECTORS.TWEET)).toHaveLength(2);
  });

  it('queryAll falls back when primary returns zero', () => {
    document.body.innerHTML =
      '<article role="article"></article><article role="article"></article>';
    expect(queryAll(SELECTORS.TWEET)).toHaveLength(2);
  });
});
