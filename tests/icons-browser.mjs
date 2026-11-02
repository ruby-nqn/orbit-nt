// Real MV3/offscreen/IndexedDB tests. Only isolated profiles and local test websites.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const run = path.resolve('artifacts', `icons-${Date.now()}`),
  build = path.resolve('dist');
await mkdir(run, { recursive: true });
let context,
  page,
  worker,
  id,
  checks = 0,
  active = 0,
  peak = 0;
const counts = new Map(),
  errors = [],
  images = {};
const check = (name, condition) => {
  assert.ok(condition, name);
  checks++;
  console.log(`PASS ${name}`);
};
const svg =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="48" fill="#784cff"/><path d="M20 35h60v30H20z" fill="#66d7a2"/></svg>';
const icon = (href, sizes = '', rel = 'icon') =>
  `<link rel="${rel}" href="${href}" sizes="${sizes}">`;
const pages = {
  '/pwa':
    '<base href="/app/">' +
    icon('../images/32.png', '512x512') +
    '<link rel="manifest" href="manifest.json">',
  '/svg': icon('/images/good.svg') + icon('/images/512.png', '512x512'),
  '/tiny':
    icon('/images/16.png', '512x512') +
    icon('/images/180.png', '180x180', 'apple-touch-icon'),
  '/padded':
    icon('/images/padded.png', '512x512') + icon('/images/192.png', '192x192'),
  '/malformed':
    '<link rel="manifest" href="/broken.json">' +
    icon('/images/192.png', '192x192'),
  '/unsafe': icon('/images/unsafe.svg') + icon('/images/32.png', '32x32'),
  '/mime': icon('/wrong.png', '512x512') + icon('/images/32.png'),
  '/broken': icon('/images/missing.svg') + icon('/images/192.png'),
  '/mono':
    '<link rel="manifest" href="/mono.json">' +
    icon('/images/180.png', '', 'apple-touch-icon'),
  '/page-a': icon('/images/a.png', '192x192'),
  '/page-b': icon('/images/b.png', '192x192'),
  '/none':
    '<title>No icons here</title><img src="/must-not-fetch"><script>fetch("/must-not-execute")</script>',
  '/oversized': ' '.repeat(800_000),
};
const server = createServer((req, res) => {
  const route = req.url.split('?')[0];
  counts.set(route, (counts.get(route) ?? 0) + 1);
  active++;
  peak = Math.max(peak, active);
  res.on('close', () => active--);
  const send = (type, body, status = 200) => {
    res.writeHead(status, {
      'Content-Type': type,
      'Cache-Control': 'no-store',
    });
    res.end(body);
  };
  if (route === '/redirect') {
    res.writeHead(302, { Location: '/svg' });
    res.end();
  } else if (route === '/blocked') send('text/html', 'Forbidden', 403);
  else if (route === '/slow')
    setTimeout(() => {
      if (!res.destroyed) send('text/html', 'late');
    }, 7000).unref();
  else if (route === '/app/manifest.json')
    send(
      'application/manifest+json',
      JSON.stringify({
        icons: [
          { src: '../images/192.png', sizes: '192x192', type: 'image/png' },
          {
            src: '../images/512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          { src: '../images/512.png', sizes: '512x512', purpose: 'maskable' },
        ],
      }),
    );
  else if (route === '/mono.json')
    send(
      'application/json',
      JSON.stringify({
        icons: [
          { src: '/images/mono.svg', sizes: 'any', purpose: 'monochrome' },
        ],
      }),
    );
  else if (route === '/broken.json')
    send('application/json', '{not valid json');
  else if (route === '/wrong.png') send('text/html', images['512']);
  else if (route === '/images/good.svg') send('image/svg+xml', svg);
  else if (route === '/images/mono.svg')
    send(
      'image/svg+xml',
      svg.replaceAll('#784cff', '#000').replaceAll('#66d7a2', '#fff'),
    );
  else if (route === '/images/unsafe.svg')
    send(
      'image/svg+xml',
      svg.replace(
        '</svg>',
        '<script>alert(1)</script><image href="https://example.com/tracker"/></svg>',
      ),
    );
  else if (route.startsWith('/images/') && images[route.slice(8, -4)])
    setTimeout(() => send('image/png', images[route.slice(8, -4)]), 25);
  else if (route in pages)
    send(
      'text/html',
      '<!doctype html><html><head>' +
        pages[route] +
        '</head><body></body></html>',
    );
  else send('text/plain', 'missing', 404);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const commonServer = createServer((req, res) => {
  if (req.url === '/favicon.svg') {
    res.writeHead(200, { 'Content-Type': 'image/svg+xml' });
    res.end(svg);
  } else if (req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<!doctype html><title>No declarations</title>');
  } else {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((resolve) => commonServer.listen(0, '127.0.0.1', resolve));
const commonOrigin = `http://127.0.0.1:${commonServer.address().port}/`;
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
    '--disable-gpu',
  ],
  viewport: { width: 1440, height: 1000 },
};
async function connect() {
  context = await chromium.launchPersistentContext(
    path.join(run, 'profile'),
    options,
  );
  worker =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent('serviceworker'));
  id = new URL(worker.url()).host;
  page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`chrome-extension://${id}/index.html`);
  console.log('Browser connected to built Orbit extension');
}
const resolve = (url) =>
  page.evaluate(
    (url) =>
      Promise.race([
        chrome.runtime.sendMessage({ type: 'resolveWebsiteIcon', url }),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error('Icon resolution timeout: ' + url)),
            60000,
          ),
        ),
      ]),
    url,
  );
async function records() {
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open('orbit-icons', 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result,
            read = db.transaction('pages').objectStore('pages').getAll();
          read.onsuccess = () => {
            db.close();
            resolve(read.result);
          };
          read.onerror = () => reject(read.error);
        };
      }),
  );
}
try {
  await connect();
  const generated = await page.evaluate(() => {
    const output = {};
    for (const name of ['16', '32', '180', '192', '512', 'padded', 'a', 'b']) {
      const size = Number(name) || (name === 'padded' ? 512 : 192),
        canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      const ctx = canvas.getContext('2d');
      const g = ctx.createLinearGradient(0, 0, size, size);
      g.addColorStop(0, name === 'b' ? '#f73482' : '#4563ff');
      g.addColorStop(1, '#12e4b4');
      ctx.fillStyle = g;
      if (name === 'padded') ctx.fillRect(240, 240, 32, 32);
      else ctx.fillRect(0, 0, size, size);
      output[name] = canvas.toDataURL('image/png').split(',')[1];
    }
    return output;
  });
  for (const [name, data] of Object.entries(generated))
    images[name] = Buffer.from(data, 'base64');
  const routes = [...Object.keys(pages), '/redirect', '/blocked', '/slow'];
  console.log('Generated image fixtures; creating bookmarked test pages');
  const seed = await page.evaluate(
    async ({ routes, origin }) => {
      const folder = await chrome.bookmarks.create({ title: 'Icon fixtures' });
      const ids = {};
      for (const route of routes)
        ids[route] = (
          await chrome.bookmarks.create({
            parentId: folder.id,
            title: route,
            url: origin + route,
          })
        ).id;
      const { preferences } = await chrome.storage.local.get('preferences');
      // Start only these local fixtures; the profile has no browsing activity.
      await chrome.storage.local.set({
        preferences: {
          ...preferences,
          settings: {
            ...(preferences?.settings ?? {}),
            onboarded: true,
            folderIds: [folder.id],
            motion: false,
          },
        },
      });
      return { ids, folder: folder.id };
    },
    { routes, origin },
  );
  const results = await Promise.all(
    routes.map((route) => resolve(origin + route).then((r) => [route, r])),
  );
  console.log('Resolved fixture websites');
  const result = Object.fromEntries(results);
  await writeFile(
    path.join(run, 'records.json'),
    JSON.stringify(result, null, 2),
  );
  for (const [route, response] of results)
    check(`resolver completes ${route}`, !response.error && !!response.record);
  check(
    'base URL and manifest relative paths select real 512px PWA asset',
    result['/pwa'].record.width === 512 &&
      result['/pwa'].record.source === 'manifest',
  );
  check(
    'safe full-color SVG outranks large raster',
    result['/svg'].record.vector &&
      result['/svg'].record.iconUrl.endsWith('/good.svg'),
  );
  check(
    'lying dimensions lose to actual 180px Apple icon',
    result['/tiny'].record.width === 180 &&
      result['/tiny'].record.source === 'apple',
  );
  check(
    'excessively padded nominal 512px loses to genuine 192px',
    result['/padded'].record.width === 192,
  );
  check(
    'malformed manifest does not break HTML icons',
    result['/malformed'].record.width === 192,
  );
  check(
    'unsafe SVG is rejected and script never executes',
    !result['/unsafe'].record.vector && result['/unsafe'].record.width === 32,
  );
  check('image MIME mismatch is rejected', result['/mime'].record.width === 32);
  check(
    'broken SVG falls through to working PNG',
    result['/broken'].record.width === 192,
  );
  check(
    'monochrome-purpose SVG loses to full-color Apple icon',
    result['/mono'].record.source === 'apple',
  );
  check(
    'page-specific branding on a shared origin remains independent',
    result['/page-a'].record.iconUrl !== result['/page-b'].record.iconUrl,
  );
  check(
    'same-site redirects preserve correct metadata base',
    result['/redirect'].record.vector,
  );
  check(
    'missing, blocked, oversized and timed-out sites get persistent negative cache',
    ['/none', '/blocked', '/oversized', '/slow'].every(
      (r) => !result[r].record.asset && result[r].record.expiresAt > Date.now(),
    ),
  );
  check(
    'remote HTML images and scripts are never attached/executed',
    !counts.has('/must-not-fetch') && !counts.has('/must-not-execute'),
  );
  check('network work is bounded to four requests', peak <= 4);
  check(
    'shared 512px asset only downloaded once across pages and duplicate declarations',
    counts.get('/images/512.png') === 1,
  );
  await page.locator('a.bubble').first().waitFor();
  const pwaBubble = page.locator(`a.bubble[href="${origin}/pwa"]`);
  await pwaBubble.locator('img[data-icon-width="512"]').waitFor();
  const rendered = await pwaBubble.locator('.favicon').evaluate((img) => ({
    fit: getComputedStyle(img).objectFit,
    complete: img.complete,
    width: img.naturalWidth,
  }));
  check(
    'upgraded cached icon renders in existing bubble without distortion',
    rendered.complete && rendered.fit === 'contain' && rendered.width === 512,
  );
  check(
    'website without icons retains readable initial',
    await page
      .locator(`a.bubble[href="${origin}/none"] .favicon-fallback`)
      .isVisible(),
  );
  await page.screenshot({ path: path.join(run, 'icons.png') });
  const before = JSON.stringify([...counts]);
  await Promise.all(Array.from({ length: 6 }, () => resolve(origin + '/pwa')));
  check(
    'repeated simultaneous resolutions reuse persistent cache',
    JSON.stringify([...counts]) === before,
  );
  const second = await context.newPage();
  await second.goto(`chrome-extension://${id}/index.html`);
  await second
    .locator(`a.bubble[href="${origin}/pwa"] img[data-icon-width="512"]`)
    .waitFor();
  check(
    'new-tab reopening displays cached image without website requests',
    JSON.stringify([...counts]) === before,
  );
  await second.close();
  check(
    'unbookmarked URLs cannot use resolver as a network proxy',
    !!(await resolve(origin + '/not-bookmarked')).error &&
      !counts.has('/not-bookmarked'),
  );
  const newUrl = origin + '/svg?updated=1';
  await page.evaluate(({ id, url }) => chrome.bookmarks.update(id, { url }), {
    id: seed.ids['/page-a'],
    url: newUrl,
  });
  check(
    'edited bookmark URLs resolve independently',
    (await resolve(newUrl)).record.vector,
  );
  const all = await records();
  check(
    'selected metadata includes source, dimensions, timestamps, and quality metrics',
    all.some(
      (r) =>
        r.width === 512 &&
        r.source === 'manifest' &&
        r.updatedAt &&
        r.expiresAt > r.updatedAt &&
        r.coverage > 0,
    ),
  );
  await context.close();
  context = undefined;
  const beforeRestart = JSON.stringify([...counts]);
  await connect();
  await page
    .locator(`a.bubble[href="${origin}/pwa"] img[data-icon-width="512"]`)
    .waitFor();
  check(
    'icon bytes and selection survive browser restart without network',
    JSON.stringify([...counts]) === beforeRestart,
  );
  // Expire a known-good selection, then make its source inaccessible.
  await page.evaluate(
    (key) =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open('orbit-icons', 1);
        open.onsuccess = () => {
          const db = open.result,
            tx = db.transaction('pages', 'readwrite'),
            store = tx.objectStore('pages'),
            request = store.get(key);
          request.onsuccess = () =>
            store.put({ ...request.result, expiresAt: 0 });
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    origin + '/pwa',
  );
  pages['/pwa'] = '<link rel="icon" href="/missing.png">';
  const stale = await resolve(origin + '/pwa');
  check(
    'failed refresh retains known-good cached image while scheduling retry',
    stale.record.width === 512 && stale.record.asset,
  );
  await page.waitForFunction(
    async () =>
      !(
        await chrome.runtime.getContexts({
          contextTypes: ['OFFSCREEN_DOCUMENT'],
        })
      ).length,
  );
  check(
    'offscreen document closes after discovery, no permanent page required',
    true,
  );
  await page.evaluate(async (url) => {
    await chrome.bookmarks.create({ title: 'Conventional icon paths', url });
  }, commonOrigin);
  const conventional = await resolve(commonOrigin);
  check(
    'conventional icon paths are probed and decoded when declarations are absent',
    conventional.record?.source === 'conventional' &&
      conventional.record?.vector,
  );
  pages['/pwa'] =
    '<base href="/app/">' +
    icon('../images/32.png') +
    '<link rel="manifest" href="manifest.json">';
  const beforeRecovery = counts.get('/images/512.png');
  await page.evaluate(
    (key) =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open('orbit-icons', 1);
        open.onsuccess = () => {
          const db = open.result,
            tx = db.transaction('assets', 'readwrite');
          tx.objectStore('assets').put({
            key,
            blob: new Blob(['corrupt'], { type: 'image/png' }),
            updatedAt: Date.now(),
          });
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    origin + '/images/512.png',
  );
  await page.reload();
  await page
    .locator(`a.bubble[href="${origin}/pwa"] img[data-icon-width="512"]`)
    .waitFor();
  check(
    'undecodable stored assets are invalidated and downloaded again automatically',
    counts.get('/images/512.png') > beforeRecovery,
  );
  if (process.env.ORBIT_ICON_LIVE === '1') {
    const sites = {
      ChatGPT: 'https://chatgpt.com/',
      Reddit: 'https://www.reddit.com/',
      YouTube: 'https://www.youtube.com/',
      Steam: 'https://store.steampowered.com/',
      'Google Drive': 'https://drive.google.com/',
      GitHub: 'https://github.com/',
    };
    await page.evaluate(async (sites) => {
      for (const [title, url] of Object.entries(sites))
        await chrome.bookmarks.create({ title, url });
    }, sites);
    const live = await Promise.all(
      Object.entries(sites).map(async ([name, url]) => {
        const response = await resolve(url);
        console.log(`LIVE ${name}: ${JSON.stringify(response)}`);
        return { name, url, ...response };
      }),
    );
    await writeFile(
      path.join(run, 'live-sites.json'),
      JSON.stringify(live, null, 2),
    );
  }
  check('no uncaught dashboard errors', errors.length === 0);
  console.log(`${checks} icon browser checks passed. Artifacts: ${run}`);
} catch (error) {
  console.log('Requests observed:', JSON.stringify([...counts]));
  throw error;
} finally {
  await context?.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  commonServer.closeAllConnections();
  await new Promise((resolve) => commonServer.close(resolve));
}
