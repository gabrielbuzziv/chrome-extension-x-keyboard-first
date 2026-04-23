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

describe('new openable/media selectors', () => {
  it('SELECTORS exports QUOTED_TWEET, CARD, IMAGE, VIDEO, BODY_URL arrays', () => {
    expect(Array.isArray(SELECTORS.QUOTED_TWEET)).toBe(true);
    expect(Array.isArray(SELECTORS.CARD)).toBe(true);
    expect(Array.isArray(SELECTORS.IMAGE)).toBe(true);
    expect(Array.isArray(SELECTORS.VIDEO)).toBe(true);
    expect(Array.isArray(SELECTORS.BODY_URL)).toBe(true);
  });

  it('IMAGE matches a tweetPhoto img', () => {
    document.body.innerHTML = `
      <article>
        <div data-testid="tweetPhoto"><img src="https://x/img?name=small"></div>
      </article>`;
    const el = queryFirst(SELECTORS.IMAGE, document.body);
    expect(el?.tagName).toBe('IMG');
  });

  it('VIDEO matches videoPlayer', () => {
    document.body.innerHTML = `
      <article><div data-testid="videoPlayer"><video></video></div></article>`;
    const el = queryFirst(SELECTORS.VIDEO, document.body);
    expect(el).not.toBeNull();
  });

  it('BODY_URL matches t.co link inside tweetText', () => {
    document.body.innerHTML = `
      <article>
        <div data-testid="tweetText">
          hi <a role="link" href="https://t.co/abc">link</a>
        </div>
      </article>`;
    const el = queryFirst(SELECTORS.BODY_URL, document.body);
    expect((el as HTMLAnchorElement)?.href).toContain('t.co');
  });
});
