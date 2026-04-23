import { describe, it, expect } from 'vitest';
import { enumerateTargets } from '../../src/content/link-mode';

function makeArticle(html: string): HTMLElement {
  const a = document.createElement('article');
  a.setAttribute('data-testid', 'tweet');
  a.innerHTML = html;
  document.body.appendChild(a);
  return a;
}

describe('enumerateTargets', () => {
  it('returns empty list for a plain-text tweet', () => {
    const article = makeArticle('<div data-testid="tweetText">hello</div>');
    expect(enumerateTargets(article)).toEqual([]);
  });

  it('collects body URLs in document order', () => {
    const article = makeArticle(`
      <div data-testid="tweetText">
        see <a role="link" href="https://t.co/aaa">one</a>
        and <a role="link" href="https://t.co/bbb">two</a>
      </div>`);
    const t = enumerateTargets(article);
    expect(t.map((x) => x.kind)).toEqual(['bodyUrl', 'bodyUrl']);
    expect(t.map((x) => (x.el as HTMLAnchorElement).href)).toEqual([
      'https://t.co/aaa',
      'https://t.co/bbb',
    ]);
  });

  it('collects card, quoted tweet, images and video in DOM order, ignoring duplicates', () => {
    const article = makeArticle(`
      <div data-testid="tweetText">
        hi <a role="link" href="https://t.co/aaa">link</a>
      </div>
      <div data-testid="card.wrapper">
        <a href="https://example.com">card</a>
      </div>
      <article data-testid="tweet">
        <a role="link" href="/u/status/999"><time>1</time></a>
        inner
      </article>
      <div data-testid="tweetPhoto"><img src="https://x/1?name=small"></div>
      <div data-testid="tweetPhoto"><img src="https://x/2?name=small"></div>
      <div data-testid="videoPlayer"><video></video></div>
    `);
    const t = enumerateTargets(article);
    expect(t.map((x) => x.kind)).toEqual([
      'bodyUrl',
      'cardLink',
      'quotedTweet',
      'image',
      'image',
      'video',
    ]);
  });

  it('caps at 9 targets', () => {
    const items = Array.from({ length: 12 }, (_, i) =>
      `<div data-testid="tweetPhoto"><img src="https://x/${i}?name=small"></div>`,
    ).join('');
    const article = makeArticle(items);
    expect(enumerateTargets(article).length).toBe(9);
  });
});
