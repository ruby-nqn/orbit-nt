// Real pointer events and frame sampling in an isolated extension profile.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const build = path.resolve('dist'),
  run = path.resolve('artifacts', `drag-${Date.now()}`);
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
  reducedMotion: 'no-preference',
};
let context,
  worker,
  page,
  id,
  checks = 0;
const errors = [];
const check = (name, value) => {
  assert.ok(value, name);
  checks++;
  console.log(`PASS ${name}`);
};
const bubble = () => page.locator('a.bubble[aria-label^="Drag 1,"]');
const position = () =>
  bubble().locator('xpath=ancestor::div[contains(@class,"bubble-position")]');
const point = async (locator) => {
  const r = await locator.boundingBox();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
};
async function settled() {
  await page.waitForFunction(
    () =>
      !document.querySelector('.dragging, .landing, .bubble-entering') &&
      [...document.querySelectorAll('.bubble-position')].every(
        (el) =>
          !el
            .getAnimations()
            .some(
              (animation) =>
                'transitionProperty' in animation &&
                ['left', 'top', 'width', 'height'].includes(
                  animation.transitionProperty,
                ),
            ),
      ),
  );
}
async function connect() {
  context = await chromium.launchPersistentContext(
    path.join(run, 'profile'),
    options,
  );
  await context.route(/^https?:/, (route) => route.abort());
  worker =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent('serviceworker'));
  id = new URL(worker.url()).host;
  page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`chrome-extension://${id}/index.html`);
}
async function moveTo(target, lifted = true) {
  const start = await point(position());
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 12 });
  await page.locator('.bubble-position.dragging').waitFor();
  if (lifted)
    await page.waitForFunction(
      () => {
        const el = document.querySelector('a.bubble[aria-label^="Drag 1,"]');
        return el && new DOMMatrix(getComputedStyle(el).transform).a > 1.04;
      },
      undefined,
      { timeout: 5000 },
    );
  return start;
}
async function releaseAndRecord() {
  await bubble().evaluate((el) => {
    const root = el.closest('.bubble-position');
    window.dropSamples = [];
    window.dropDone = false;
    document.addEventListener(
      'pointerup',
      () => {
        const start = performance.now();
        const record = () => {
          const r = root.getBoundingClientRect();
          window.dropSamples.push({
            time: performance.now() - start,
            x: r.x + r.width / 2,
            y: r.y + r.height / 2,
          });
          if (performance.now() - start < 380) requestAnimationFrame(record);
          else window.dropDone = true;
        };
        record();
      },
      { once: true, capture: true },
    );
  });
  await page.mouse.up();
  await page.waitForFunction(() => window.dropDone);
  return page.evaluate(() => window.dropSamples);
}
try {
  await connect();
  await page.getByRole('dialog', { name: 'Welcome to your orbit.' }).waitFor();
  const fixture = await worker.evaluate(async () => {
    const folder = await chrome.bookmarks.create({ title: 'Drag fixtures' });
    const items = [];
    for (let i = 0; i < 18; i++)
      items.push(
        await chrome.bookmarks.create({
          parentId: folder.id,
          title: `Drag ${i + 1}`,
          url: `https://drag.example/${i + 1}`,
        }),
      );
    return { folder, items };
  });
  await page.getByLabel(/^Drag fixtures/).check();
  await page.getByRole('button', { name: 'Create my orbit' }).click();
  await page.waitForFunction(
    () => document.querySelectorAll('a.bubble').length === 18,
  );
  await worker.evaluate(async () => {
    const { preferences } = await chrome.storage.local.get('preferences');
    preferences.settings.floatIntensity = 0;
    preferences.settings.header.rotate = false;
    preferences.settings.header.fixedQuote = 'Ready when you are.';
    await chrome.storage.local.set({ preferences });
  });
  await settled();
  const canvas = await page.locator('.workspace').boundingBox();
  const far = { x: canvas.x + 75, y: canvas.y + 80 };
  const original = await moveTo(far);
  check(
    'dragging lifts the bubble without changing its pointer-aligned center',
    (await bubble().evaluate(
      (el) => new DOMMatrix(getComputedStyle(el).transform).a > 1.04,
    )) &&
      Math.hypot(
        (await point(position())).x - far.x,
        (await point(position())).y - far.y,
      ) < 1.5,
  );
  const farFrames = await releaseAndRecord();
  check(
    'drop frames stay at the release point without snapping back to the original position',
    Math.hypot(original.x - far.x, original.y - far.y) > 100 &&
      farFrames.every(
        (frame) => Math.hypot(frame.x - far.x, frame.y - far.y) < 1.5,
      ),
  );
  await settled();
  let saved = await worker.evaluate(
    async (bookmarkId) =>
      (await chrome.storage.local.get('preferences')).preferences.positions[
        bookmarkId
      ],
    fixture.items[0].id,
  );
  check(
    'an intentional far placement is saved as a detached manual anchor',
    saved.manual && saved.detached,
  );
  check(
    'dragging never opens the bookmark',
    page.url().includes('/index.html'),
  );

  const near = {
    x: canvas.x + canvas.width / 2 + 70,
    y: canvas.y + canvas.height / 2 + 35,
  };
  await moveTo(near);
  const nearFrames = await releaseAndRecord();
  await settled();
  const nearEnd = await point(position());
  const center = {
    x: canvas.x + canvas.width / 2,
    y: canvas.y + canvas.height / 2,
  };
  check(
    'a nearby drop settles gently toward the central cluster from the release point',
    Math.hypot(nearEnd.x - center.x, nearEnd.y - center.y) <
      Math.hypot(near.x - center.x, near.y - center.y) &&
      nearFrames.every(
        (frame) => Math.hypot(frame.x - near.x, frame.y - near.y) <= 40.5,
      ),
  );
  saved = await worker.evaluate(
    async (bookmarkId) =>
      (await chrome.storage.local.get('preferences')).preferences.positions[
        bookmarkId
      ],
    fixture.items[0].id,
  );
  check(
    'moving a detached bubble back into the cluster clears its detached status',
    saved.manual && !saved.detached,
  );
  check(
    'landing completes without a persistent drag or landing animation',
    (await page.locator('.dragging, .landing').count()) === 0,
  );

  const neighbor = page
    .locator('a.bubble[aria-label^="Drag 2,"]')
    .locator('xpath=ancestor::div[contains(@class,"bubble-position")]');
  const occupied = await point(neighbor);
  await moveTo(occupied);
  await releaseAndRecord();
  await settled();
  const movedNeighbor = await point(neighbor),
    dropped = await point(position());
  check(
    'dropping into an occupied area gives the released bubble priority and lets neighbors make room',
    Math.hypot(dropped.x - occupied.x, dropped.y - occupied.y) <= 40.5 &&
      Math.hypot(movedNeighbor.x - occupied.x, movedNeighbor.y - occupied.y) >
        20,
  );
  const circles = await page
    .locator('.bubble-position')
    .evaluateAll((elements) =>
      elements.map((el) => {
        const r = el.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2, r: r.width / 2 };
      }),
    );
  check(
    'all bubbles remain accessible and resting circles do not overlap after a drop',
    circles.length === 18 &&
      circles.every((a, i) =>
        circles.every(
          (b, j) =>
            i === j || Math.hypot(a.x - b.x, a.y - b.y) >= a.r + b.r + 14 - 0.1,
        ),
      ),
  );
  const beforeCancel = await point(position());
  const savedBeforeCancel = await worker.evaluate(
    async (bookmarkId) =>
      (await chrome.storage.local.get('preferences')).preferences.positions[
        bookmarkId
      ],
    fixture.items[0].id,
  );
  await moveTo({ x: beforeCancel.x + 90, y: beforeCancel.y - 35 });
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await settled();
  const cancelled = await point(position());
  const savedAfterCancel = await worker.evaluate(
    async (bookmarkId) =>
      (await chrome.storage.local.get('preferences')).preferences.positions[
        bookmarkId
      ],
    fixture.items[0].id,
  );
  check(
    'Escape cancels a drag without moving the saved anchor or navigating',
    Math.hypot(cancelled.x - beforeCancel.x, cancelled.y - beforeCancel.y) <
      1 &&
      JSON.stringify(savedBeforeCancel) === JSON.stringify(savedAfterCancel) &&
      page.url().includes('/index.html'),
  );
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await moveTo(far, false);
  const reducedFrames = await releaseAndRecord();
  check(
    'reduced motion preserves direct placement while skipping lift and landing animations',
    reducedFrames.every(
      (frame) => Math.hypot(frame.x - far.x, frame.y - far.y) < 1.5,
    ) && (await page.locator('.landing').count()) === 0,
  );
  await page.screenshot({ path: path.join(run, 'drag-settled.png') });
  saved = await worker.evaluate(
    async (bookmarkId) =>
      (await chrome.storage.local.get('preferences')).preferences.positions[
        bookmarkId
      ],
    fixture.items[0].id,
  );
  await context.close();
  await connect();
  await bubble().waitFor();
  await settled();
  const restoredCanvas = await page.locator('.workspace').boundingBox();
  const restored = await point(position());
  check(
    'resolved positions and intentional outliers stay put after restarting the browser',
    Math.hypot(
      restored.x - restoredCanvas.x - saved.x * restoredCanvas.width,
      restored.y - restoredCanvas.y - saved.y * restoredCanvas.height,
    ) < 1.5,
  );
  check('no uncaught drag UI errors', errors.length === 0);
  console.log(`Completed ${checks} drag integration checks. Artifacts: ${run}`);
} catch (error) {
  await page
    ?.screenshot({ path: path.join(run, 'failure.png') })
    .catch(() => {});
  throw error;
} finally {
  await context?.close();
}
