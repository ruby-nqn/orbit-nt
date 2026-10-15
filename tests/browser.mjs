// Isolated real-extension integration tests. Fixtures never touch the user's profile.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'node:http';
import { chromium } from 'playwright';

const build = path.resolve('dist');
const run = path.resolve('artifacts', `browser-${Date.now()}`);
const profile = path.join(run, 'profile');
await mkdir(run, { recursive: true });
const options = {
  ...(process.env.ORBIT_BROWSER
    ? { executablePath: process.env.ORBIT_BROWSER }
    : { channel: 'chromium' }),
  headless: true,
  timeout: 30000,
  ignoreDefaultArgs: ['--disable-extensions'],
  args: [
    `--disable-extensions-except=${build}`,
    `--load-extension=${build}`,
    '--no-first-run',
  ],
  viewport: { width: 1440, height: 1000 },
  acceptDownloads: true,
};
let context;
const failures = [];
let checks = 0;
const favicon = await readFile(path.resolve('public/icons/icon-48.png'));
const server = createServer((request, response) => {
  if (request.url === '/favicon.ico') {
    response.writeHead(200, { 'Content-Type': 'image/png' });
    response.end(favicon);
  } else {
    response.writeHead(200, { 'Content-Type': 'text/html' });
    response.end(
      '<!doctype html><title>Local Orbit navigation fixture</title><link rel="icon" href="/favicon.ico"><h1>Local navigation fixture</h1>',
    );
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const localUrl = `http://127.0.0.1:${server.address().port}/home`;
function check(name, condition) {
  assert.ok(condition, name);
  checks++;
  console.log(`PASS ${name}`);
}
async function connect() {
  context = await chromium.launchPersistentContext(profile, options);
  const worker =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent('serviceworker', { timeout: 30000 }));
  const id = new URL(worker.url()).host;
  const page = await context.newPage();
  page.on('pageerror', (error) => failures.push(error.message));
  await page.goto(`chrome-extension://${id}/index.html`);
  return { worker, page, id };
}
try {
  let { worker, page, id } = await connect();
  await page.getByRole('dialog', { name: 'Welcome to your orbit.' }).waitFor();
  check(
    'extension installs and opens privacy onboarding',
    await page.getByText('Just between you and your browser.').isVisible(),
  );
  const seed = await worker.evaluate(async () => {
    const folder = await chrome.bookmarks.create({
      title: 'Orbit integration fixtures',
    });
    const names = [
      'GitHub',
      'Figma',
      'Notion',
      'Linear',
      'YouTube',
      'Are.na',
      'Read.cv',
      'Spotify',
      'Dribbble',
      'Pinterest',
      'Gmail',
      'Google Calendar',
      'Vercel',
      'Apple',
      'CodePen',
      'Wikipedia',
      'Dropbox',
      'MDN',
      'Framer',
      'Unsplash',
      'The Verge',
      'Arc',
    ];
    const urls = [
      'https://github.com/',
      'https://figma.com/',
      'https://notion.so/',
      'https://linear.app/',
      'https://youtube.com/',
      'https://are.na/',
      'https://read.cv/',
      'https://open.spotify.com/',
      'https://dribbble.com/',
      'https://pinterest.com/',
      'https://mail.google.com/',
      'https://calendar.google.com/',
      'https://vercel.com/',
      'https://apple.com/',
      'https://codepen.io/',
      'https://wikipedia.org/',
      'https://dropbox.com/',
      'https://developer.mozilla.org/',
      'https://framer.com/',
      'https://unsplash.com/',
      'https://theverge.com/',
      'https://arc.net/',
    ];
    const items = [];
    for (let i = 0; i < names.length; i++) {
      items.push(
        await chrome.bookmarks.create({
          parentId: folder.id,
          title: names[i],
          url: urls[i],
        }),
      );
      // Add genuine timestamped history through the browser API, exclusively in this test profile.
      for (let v = 0; v < (i < 12 ? 24 - i * 2 : 0); v++)
        await chrome.history.addUrl({ url: urls[i] });
    }
    return { folder, items };
  });
  await page.getByLabel(/Orbit integration fixtures/).check();
  await page.getByRole('button', { name: 'Create my orbit' }).click();
  await page.waitForFunction(
    () => document.querySelectorAll('a.bubble').length >= 20,
  );
  await page.waitForFunction(() =>
    document
      .querySelector('a.bubble[aria-label^="GitHub,"]')
      ?.getAttribute('aria-label')
      ?.includes('24 visits today'),
  );
  check('real bookmarks and actual visits drive the bubbles', true);
  const dimensions = await page
    .locator('a.bubble')
    .evaluateAll((els) =>
      Object.fromEntries(
        els.map((el) => [
          el.getAttribute('aria-label').split(',')[0],
          el.getBoundingClientRect().width,
        ]),
      ),
    );
  check(
    'activity changes bounded bubble diameters',
    dimensions.GitHub > dimensions.Apple &&
      dimensions.GitHub <= 161 &&
      dimensions.Apple >= 52,
  );
  await page.getByRole('button', { name: 'Open settings' }).click();
  await page.getByRole('button', { name: 'Layout', exact: true }).click();
  await page.getByLabel('Animations', { exact: false }).uncheck();
  await page.getByRole('button', { name: 'Close Make it yours' }).click();
  await page.screenshot({ path: path.join(run, 'orbit-dark.png') });
  const bubble = page.locator('a.bubble[aria-label^="GitHub,"]');
  await bubble.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Change color & size' }).click();
  await page.getByLabel('Bubble color', { exact: true }).fill('#ed7a9e');
  await page.getByLabel('Fixed size', { exact: true }).check();
  await page.getByRole('slider', { name: 'Fixed bubble diameter' }).fill('120');
  await page.getByRole('button', { name: 'Close A personal touch' }).click();
  await page.waitForFunction(
    () =>
      document
        .querySelector('a.bubble[aria-label^="GitHub,"]')
        ?.closest('.bubble-position')
        ?.style.getPropertyValue('--accent') === '#ed7a9e',
  );
  check('manual color and fixed size preview immediately', true);
  const rect = await bubble.boundingBox();
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    rect.x + rect.width / 2 + 110,
    rect.y + rect.height / 2 - 40,
    { steps: 12 },
  );
  await page.mouse.up();
  await page.waitForFunction(
    async (id) =>
      (await chrome.storage.local.get('preferences')).preferences.positions[id]
        ?.manual,
    seed.items[0].id,
  );
  check(
    'drag persists normalized manual coordinates without navigating',
    page.url().includes('/index.html'),
  );
  await page.keyboard.press('/');
  check(
    'search shortcut focuses the search input',
    await page
      .getByRole('searchbox', { name: 'Search by bookmark name or URL' })
      .evaluate((el) => document.activeElement === el),
  );
  await page.keyboard.type('GitHub');
  check(
    'keyboard search filters real bookmarks',
    (await page.locator('.result-row').count()) === 1,
  );
  await page.keyboard.press('Escape');
  await bubble.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Pin bubble', exact: true }).click();
  await page.waitForFunction(
    () =>
      !!document.querySelector('a.bubble[aria-label^="GitHub,"] .pin-marker'),
  );
  check('pinning retains a fixed size and marks the bubble', true);
  await page.getByRole('button', { name: 'Open settings' }).click();
  await page.getByRole('button', { name: 'Appearance', exact: true }).click();
  await page.getByRole('button', { name: 'Light', exact: true }).click();
  check(
    'light theme previews immediately',
    (await page.evaluate(() => document.documentElement.dataset.theme)) ===
      'light',
  );
  await page.getByRole('button', { name: 'Close Make it yours' }).click();
  await page.screenshot({ path: path.join(run, 'orbit-light.png') });
  await page.getByRole('button', { name: 'Open settings' }).click();
  await page.getByRole('button', { name: 'Appearance', exact: true }).click();
  await page.getByRole('button', { name: 'Dark', exact: true }).click();
  await page.getByRole('button', { name: 'Data', exact: true }).click();
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const download = await downloading;
  const exportPath = path.join(run, 'preferences.json');
  await download.saveAs(exportPath);
  const exported = JSON.parse(await readFile(exportPath, 'utf8'));
  check(
    'export preserves colors, sizes and positions without history',
    exported.overrides[seed.items[0].id].color === '#ed7a9e' &&
      !('activityCache' in exported),
  );
  const invalid = path.join(run, 'invalid.json');
  await writeFile(invalid, '{"version":100}');
  await page
    .locator('label.upload-button')
    .filter({ hasText: 'Import' })
    .locator('input')
    .setInputFiles(invalid);
  await page
    .getByText('This is not a supported Orbit preferences file.')
    .waitFor();
  check(
    'import rejects incompatible JSON visibly',
    await page
      .getByText('This is not a supported Orbit preferences file.')
      .isVisible(),
  );
  await page.getByRole('button', { name: 'Close Make it yours' }).click();
  const added = await worker.evaluate(
    async (folderId) =>
      chrome.bookmarks.create({
        parentId: folderId,
        title: 'Added automatically',
        url: 'https://example.com/new',
      }),
    seed.folder.id,
  );
  await page.locator('a.bubble[aria-label^="Added automatically,"]').waitFor();
  check('bookmark additions arrive through live browser events', true);
  await page
    .locator('a.bubble[aria-label^="Added automatically,"]')
    .click({ button: 'right' });
  await page
    .getByRole('menuitem', { name: 'Edit bookmark', exact: true })
    .click();
  await page.getByLabel('Title', { exact: true }).fill('Renamed bookmark');
  await page.getByRole('button', { name: 'Save bookmark' }).click();
  await page.locator('a.bubble[aria-label^="Renamed bookmark,"]').waitFor();
  check(
    'bookmark edits update the real bookmark and bubble',
    (await worker.evaluate(
      async (id) => (await chrome.bookmarks.get(id))[0].title,
      added.id,
    )) === 'Renamed bookmark',
  );
  await page
    .locator('a.bubble[aria-label^="Renamed bookmark,"]')
    .click({ button: 'right' });
  await page
    .getByRole('menuitem', { name: 'Remove bookmark…', exact: true })
    .click();
  check(
    'removing a bookmark requires explicit confirmation',
    await page
      .getByRole('dialog', { name: 'Remove this bookmark?' })
      .isVisible(),
  );
  await page
    .getByRole('button', { name: 'Remove bookmark', exact: true })
    .click();
  await page.waitForFunction(
    () => !document.querySelector('a.bubble[aria-label^="Renamed bookmark,"]'),
  );
  check(
    'confirmed deletion removes the actual bookmark',
    await worker.evaluate(async (id) => {
      try {
        await chrome.bookmarks.get(id);
        return false;
      } catch {
        return true;
      }
    }, added.id),
  );
  const extras = await worker.evaluate(
    async ({ folder, url }) => {
      const duplicate = await chrome.bookmarks.create({
        parentId: folder,
        title: 'GitHub duplicate',
        url,
      });
      const page = await chrome.bookmarks.create({
        parentId: folder,
        title: 'GitHub Explore',
        url: `${url}explore`,
      });
      await chrome.history.addUrl({ url: `${url}explore` });
      return [duplicate.id, page.id];
    },
    { folder: seed.folder.id, url: seed.items[0].url },
  );
  await page.locator('a.bubble[aria-label^="GitHub duplicate,"]').waitFor();
  await page.waitForFunction(() =>
    document
      .querySelector('a.bubble[aria-label^="GitHub duplicate,"]')
      ?.getAttribute('aria-label')
      ?.includes('24 visits today'),
  );
  check(
    'duplicate bookmarks retain identities and share a single page count',
    true,
  );
  await page.getByRole('button', { name: 'Open settings' }).click();
  await page.getByLabel('Group by website', { exact: false }).check();
  await page.getByRole('button', { name: 'Close Make it yours' }).click();
  const group = page.locator('a.bubble[aria-label^="github.com,"]');
  await group.waitFor();
  await page.waitForFunction(() =>
    document
      .querySelector('a.bubble[aria-label^="github.com,"]')
      ?.getAttribute('aria-label')
      ?.includes('25 visits today'),
  );
  check('domain mode aggregates all matching pages once', true);
  await group.click();
  check(
    'domain bubbles expand into individual bookmarked pages',
    (await page
      .getByRole('dialog', { name: 'github.com', exact: true })
      .locator('.group-page')
      .count()) === 3,
  );
  await page.getByRole('button', { name: 'Close github.com' }).click();
  await worker.evaluate(
    async (url) => chrome.history.addUrl({ url }),
    seed.items[0].url,
  );
  await page.waitForFunction(() =>
    document
      .querySelector('a.bubble[aria-label^="github.com,"]')
      ?.getAttribute('aria-label')
      ?.includes('26 visits today'),
  );
  check('history events refresh open-tab sizes automatically', true);
  await group.click({ button: 'right' });
  await page
    .getByRole('menuitem', { name: 'Hide from Orbit', exact: true })
    .click();
  await page.waitForFunction(
    () => !document.querySelector('a.bubble[aria-label^="github.com,"]'),
  );
  check(
    'hide only changes Orbit visibility and preserves browser bookmarks',
    (
      await worker.evaluate(
        async (id) => chrome.bookmarks.get(id),
        seed.items[0].id,
      )
    ).length === 1,
  );
  await page.getByRole('button', { name: 'Open settings' }).click();
  await page.getByRole('button', { name: 'Show all hidden bookmarks' }).click();
  await page.getByLabel('Group by website', { exact: false }).uncheck();
  await page.getByRole('button', { name: 'Close Make it yours' }).click();
  await worker.evaluate(async (ids) => {
    for (const id of ids) await chrome.bookmarks.remove(id);
  }, extras);
  await page.waitForFunction(
    () => document.querySelectorAll('a.bubble').length === 22,
  );
  check(
    'restoring hidden entries and exact URL mode keeps the original overrides',
    (await bubble.locator('.pin-marker').count()) === 1,
  );
  await page.waitForFunction(async () => {
    const data = await chrome.storage.local.get([
      'activityCache',
      'bookmarkCache',
      'preferences',
      'historyRevision',
    ]);
    const s = data.preferences.settings;
    const selected = data.bookmarkCache.bookmarks.filter(
      (b) =>
        b.ancestors.some((id) => s.folderIds.includes(id)) &&
        !s.hiddenIds.includes(b.id),
    );
    return (
      data.activityCache?.key ===
        `exact:${JSON.stringify([...new Set(selected.map((b) => b.canonical))].sort())}` &&
      data.activityCache?.revision === (data.historyRevision ?? '')
    );
  });
  const cachedAt = await worker.evaluate(
    async () =>
      (await chrome.storage.local.get('activityCache')).activityCache.updatedAt,
  );
  const second = await context.newPage();
  await second.goto(`chrome-extension://${id}/index.html`);
  await second.locator('a.bubble').first().waitFor();
  check(
    'a new tab renders from persistent cache without a history rescan',
    (await worker.evaluate(
      async () =>
        (await chrome.storage.local.get('activityCache')).activityCache
          .updatedAt,
    )) === cachedAt,
  );
  await second.close();
  await page.bringToFront();
  const localPage = await context.newPage();
  await localPage.goto(localUrl);
  await localPage.close();
  const localBookmark = await worker.evaluate(
    async ({ folder, url }) =>
      chrome.bookmarks.create({
        parentId: folder,
        title: 'Local favicon fixture',
        url,
      }),
    { folder: seed.folder.id, url: localUrl },
  );
  const localBubble = page.locator(
    'a.bubble[aria-label^="Local favicon fixture,"]',
  );
  await localBubble.waitFor();
  await localBubble.locator('.favicon-fallback').waitFor();
  check(
    'missing cached favicons produce readable title initials',
    (await localBubble.locator('.favicon-fallback').innerText()) === 'L',
  );
  const ctrlOpened = context.waitForEvent('page');
  await localBubble.click({ modifiers: ['Control'] });
  const ctrlPage = await ctrlOpened;
  await ctrlPage.waitForURL(localUrl);
  check(
    'Ctrl-click opens a new tab and preserves Orbit',
    page.url().includes(id),
  );
  await ctrlPage.close();
  await page.bringToFront();
  const middleOpened = context.waitForEvent('page');
  await localBubble.click({ button: 'middle' });
  const middlePage = await middleOpened;
  await middlePage.waitForURL(localUrl);
  check(
    'middle-click uses conventional new-tab navigation',
    page.url().includes(id),
  );
  await middlePage.close();
  await page.bringToFront();
  await localBubble.click();
  await page.waitForURL(localUrl);
  check(
    'left click opens the bookmark in the current tab',
    page.url() === localUrl,
  );
  await page.goto(`chrome-extension://${id}/index.html`);
  await worker.evaluate(
    async (id) => chrome.bookmarks.remove(id),
    localBookmark.id,
  );
  await page.waitForFunction(
    () => document.querySelectorAll('a.bubble').length === 22,
  );
  const cdp = await context.newCDPSession(page);
  await cdp.send('ServiceWorker.enable');
  await cdp.send('ServiceWorker.stopAllWorkers');
  const resynced = await page.evaluate(async () =>
    chrome.runtime.sendMessage({ type: 'snapshot' }),
  );
  check(
    'suspended service worker wakes and reliably resynchronizes',
    resynced.data?.bookmarks.bookmarks.length >= 22,
  );
  await cdp.detach();
  await page.setViewportSize({ width: 390, height: 650 });
  await page.getByRole('button', { name: /All bookmarks/ }).click();
  check(
    'every bookmark stays accessible in dense viewports',
    (await page.locator('.result-row').count()) === seed.items.length,
  );
  await page.getByRole('button', { name: 'Close All bookmarks' }).click();
  const circles = await page.locator('a.bubble').evaluateAll((elements) =>
    elements.map((el) => {
      const r = el.getBoundingClientRect();
      return {
        x: r.x + r.width / 2,
        y: r.y + r.height / 2,
        radius: r.width / 2,
      };
    }),
  );
  check(
    'rendered circles have no resting overlaps after viewport resize',
    circles.every((a, i) =>
      circles.every(
        (b, j) =>
          i === j || Math.hypot(a.x - b.x, a.y - b.y) >= a.radius + b.radius,
      ),
    ),
  );
  await page.screenshot({ path: path.join(run, 'orbit-mobile.png') });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const animations = await page
    .locator('.bubble-float')
    .first()
    .evaluate((el) => getComputedStyle(el).animationName);
  check(
    'system reduced motion disables floating animations',
    animations === 'none',
  );
  await page.goto('chrome://newtab');
  if (process.env.ORBIT_BROWSER?.toLowerCase().includes('vivaldi')) {
    // Vivaldi can require the user preference "Controlled by Extension".
    console.log(`New-tab route in supplied browser: ${await page.title()}`);
    await page.goto(`chrome-extension://${id}/index.html`);
  } else {
    await page.waitForFunction(() => document.title === 'Orbit · New Tab');
    check('Manifest V3 replaces the actual Chromium new-tab page', true);
  }
  await context.close();
  ({ worker, page, id } = await connect());
  await page.locator('a.bubble[aria-label^="GitHub,"]').waitFor();
  const restored = await worker.evaluate(
    async () => (await chrome.storage.local.get('preferences')).preferences,
  );
  check(
    'browser restart preserves manual color, pin, positions and disabled animations',
    restored.overrides[seed.items[0].id].color === '#ed7a9e' &&
      restored.overrides[seed.items[0].id].pinned &&
      restored.positions[seed.items[0].id].manual &&
      !restored.settings.motion,
  );
  check('no uncaught UI errors', failures.length === 0);
  console.log(`Completed ${checks} real-extension checks. Artifacts: ${run}`);
} catch (error) {
  if (context?.pages().length)
    await context
      .pages()
      .at(-1)
      .screenshot({ path: path.join(run, 'failure.png') })
      .catch(() => {});
  throw error;
} finally {
  await context?.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
