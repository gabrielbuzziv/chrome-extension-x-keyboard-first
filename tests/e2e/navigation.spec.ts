import { test, expect, chromium } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import http from 'node:http';
import { readFileSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(__dirname, '..', 'fixtures');
const distDir = resolve(__dirname, '..', '..', 'dist');
const hostResolverRules =
  '--host-resolver-rules=MAP x.com 127.0.0.1,MAP example.com 127.0.0.1';

let server: http.Server;
let port = 0;

function fixtureUrl(host: 'x.com' | 'example.com', path: string): string {
  return `http://${host}:${port}${path}`;
}

async function launchExtensionContext(
  profileDir: string,
  viewport = { width: 1280, height: 800 },
) {
  return chromium.launchPersistentContext(resolve(__dirname, profileDir), {
    headless: false,
    viewport,
    args: [
      `--disable-extensions-except=${distDir}`,
      `--load-extension=${distDir}`,
      hostResolverRules,
    ],
  });
}

async function withExtensionContext(
  profileDir: string,
  run: (ctx: Awaited<ReturnType<typeof launchExtensionContext>>) => Promise<void>,
  viewport?: { width: number; height: number },
) {
  const ctx = await launchExtensionContext(profileDir, viewport);
  try {
    await run(ctx);
  } finally {
    await ctx.close();
  }
}

test.beforeAll(async () => {
  server = http.createServer((req, res) => {
    const name = req.url === '/' || req.url === '/timeline'
      ? 'x-timeline.html'
      : req.url === '/thread'
        ? 'x-thread.html'
        : req.url === '/truncated'
          ? 'x-timeline-truncated.html'
          : req.url === '/media'
            ? 'x-timeline-media.html'
            : null;
    if (!name) { res.statusCode = 404; return res.end('nope'); }
    res.setHeader('content-type', 'text/html');
    res.end(readFileSync(resolve(fixturesDir, name)));
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  port = (server.address() as { port: number }).port;
});

test.afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
});

test('extension highlights on ArrowDown and moves across tweets', async () => {
  await withExtensionContext(
    '.pw-profile',
    async (ctx) => {
      const page = await ctx.newPage();
      await page.goto(fixtureUrl('x.com', '/timeline'));
      await page.waitForSelector('article[data-testid="tweet"]');

      await page.keyboard.press('ArrowDown');
      await expect(
        page.locator('article[data-xkbd-active="true"]'),
      ).toHaveAttribute('data-testid', 'tweet');

      const ids = await page.$$eval(
        'article[data-testid="tweet"]',
        (els) => els.map((el) => el.querySelector('a[href*="/status/"]')?.getAttribute('href')),
      );
      expect(ids).toEqual([
        '/user/status/111',
        '/user/status/222',
        '/user/status/333',
      ]);

      await page.keyboard.press('ArrowUp');
      const activeHref = await page.$eval(
        'article[data-xkbd-active="true"] a[href*="/status/"]',
        (el) => (el as HTMLAnchorElement).getAttribute('href'),
      );
      expect(activeHref).toBe('/user/status/111');
    },
    { width: 1280, height: 60 },
  );
});

test('? opens the help overlay', async () => {
  await withExtensionContext('.pw-profile-2', async (ctx) => {
    const page = await ctx.newPage();
    await page.goto(fixtureUrl('x.com', '/timeline'));
    await page.waitForSelector('article[data-testid="tweet"]');
    await page.keyboard.press('?'); // opens help overlay
    const dialog = page.locator('div[data-xkbd-help]').first();
    await expect(dialog).toBeAttached();
  });
});

test('Space expands a truncated post and does not page down', async () => {
  await withExtensionContext('.pw-profile-truncated', async (ctx) => {
    const page = await ctx.newPage();
    await page.goto(fixtureUrl('x.com', '/truncated'));
    await page.waitForSelector('article[data-testid="tweet"]');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowUp');
    await expect(
      page.locator('article[data-xkbd-active="true"] a[href*="/status/"]'),
    ).toHaveAttribute('href', '/user/status/111');
    const y1 = await page.evaluate(() => window.scrollY);
    await page.keyboard.press(' ');
    const y2 = await page.evaluate(() => window.scrollY);
    expect(y2).toBe(y1);
    const clicks = await page.evaluate(() => (window as any).__expandClicked ?? 0);
    expect(clicks).toBe(1);
  });
});

test('o then digit opens media modal; Escape closes it', async () => {
  await withExtensionContext('.pw-profile-media', async (ctx) => {
    const page = await ctx.newPage();
    await page.goto(fixtureUrl('x.com', '/media'));
    await page.waitForSelector('article[data-testid="tweet"]');
    // Activate the article. The fixture has a single tweet — ArrowDown activates it
    // (ensureActive sets active to nearest, then 'next' advances. Since there's only
    // one tweet, 'next' is a no-op and activeId stays on the single tweet.)
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('o');
    // Badges now painted; first image is 1 (no body URLs enumerated).
    await page.keyboard.press('1');
    await expect(page.locator('[data-xkbd-media]')).toHaveCount(1);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-xkbd-media]')).toHaveCount(0);
  });
});

test('extension does not load on a non-x host', async () => {
  await withExtensionContext('.pw-profile-other-host', async (ctx) => {
    const page = await ctx.newPage();
    await page.goto(fixtureUrl('example.com', '/timeline'));
    await page.waitForSelector('article[data-testid="tweet"]');
    await page.keyboard.press('?');
    await expect(page.locator('[data-xkbd-hint]')).toHaveCount(0);
    await expect(page.locator('[data-xkbd-help]')).toHaveCount(0);
  });
});
