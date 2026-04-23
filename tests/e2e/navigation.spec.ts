import { test, expect, chromium } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import http from 'node:http';
import { readFileSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(__dirname, '..', 'fixtures');
const distDir = resolve(__dirname, '..', '..', 'dist');

let server: http.Server;
let port = 0;

test.beforeAll(async () => {
  server = http.createServer((req, res) => {
    const name = req.url === '/' || req.url === '/timeline'
      ? 'x-timeline.html'
      : req.url === '/thread'
        ? 'x-thread.html'
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
  const userDataDir = resolve(__dirname, '.pw-profile');
  const ctx = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    viewport: { width: 1280, height: 60 },
    args: [
      `--disable-extensions-except=${distDir}`,
      `--load-extension=${distDir}`,
    ],
  });
  const page = await ctx.newPage();
  await page.goto(`http://127.0.0.1:${port}/timeline`);
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

  await ctx.close();
});

test('? opens the help overlay', async () => {
  const userDataDir = resolve(__dirname, '.pw-profile-2');
  const ctx = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    viewport: { width: 1280, height: 60 },
    args: [
      `--disable-extensions-except=${distDir}`,
      `--load-extension=${distDir}`,
    ],
  });
  const page = await ctx.newPage();
  await page.goto(`http://127.0.0.1:${port}/timeline`);
  await page.waitForSelector('article[data-testid="tweet"]');
  await page.keyboard.press('?'); // opens help overlay
  const dialog = page.locator('div[data-xkbd-help]').first();
  await expect(dialog).toBeAttached();
  await ctx.close();
});
