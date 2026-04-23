import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { collectTweets, createRegistry } from '../../src/content/tweet-registry';

function tweetHtml(id: string, extraHref = ''): string {
  return `
    <article data-testid="tweet">
      <a role="link" href="/user/status/${id}${extraHref}"><time></time></a>
    </article>
  `;
}

async function nextFrame() {
  await new Promise<void>((r) => requestAnimationFrame(() => r()));
}

describe('collectTweets', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('returns entries in DOM order with parsed ids', () => {
    document.body.innerHTML = tweetHtml('111') + tweetHtml('222') + tweetHtml('333');
    expect(collectTweets().map((e) => e.id)).toEqual(['111', '222', '333']);
  });

  it('dedupes tweets with the same id', () => {
    document.body.innerHTML = tweetHtml('111') + tweetHtml('111');
    expect(collectTweets()).toHaveLength(1);
  });

  it('parses id from /status/<id>/photo/1 style urls', () => {
    document.body.innerHTML = tweetHtml('42', '/photo/1');
    expect(collectTweets()[0].id).toBe('42');
  });

  it('skips articles with no /status/<id> link', () => {
    document.body.innerHTML = '<article data-testid="tweet"></article>';
    expect(collectTweets()).toEqual([]);
  });
});

describe('createRegistry', () => {
  let reg: ReturnType<typeof createRegistry>;
  beforeEach(() => { document.body.innerHTML = ''; });
  afterEach(() => reg?.stop());

  it('exposes current tweets', () => {
    document.body.innerHTML = tweetHtml('1') + tweetHtml('2');
    reg = createRegistry();
    expect(reg.current().map((e) => e.id)).toEqual(['1', '2']);
  });

  it('rebuilds on DOM mutation', async () => {
    document.body.innerHTML = tweetHtml('1');
    reg = createRegistry();
    document.body.insertAdjacentHTML('beforeend', tweetHtml('2'));
    await nextFrame();
    expect(reg.current().map((e) => e.id)).toEqual(['1', '2']);
  });

  it('findById resolves to the current TweetEntry', () => {
    document.body.innerHTML = tweetHtml('7');
    reg = createRegistry();
    expect(reg.findById('7')?.id).toBe('7');
    expect(reg.findById('missing')).toBeUndefined();
  });

  it('notifies subscribers on rebuild', async () => {
    document.body.innerHTML = tweetHtml('1');
    reg = createRegistry();
    let calls = 0;
    reg.subscribe(() => { calls++; });
    document.body.insertAdjacentHTML('beforeend', tweetHtml('2'));
    await nextFrame();
    expect(calls).toBeGreaterThan(0);
  });
});
