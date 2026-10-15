// Real browser API fixtures in an isolated profile; only the page clock is controlled.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const build = path.resolve('dist'),
  run = path.resolve('artifacts', `folders-${Date.now()}`);
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
  reducedMotion: 'reduce',
};
let context,
  page,
  worker,
  id,
  checks = 0;
const errors = [];
const check = (name, condition) => {
  assert.ok(condition, name);
  checks++;
  console.log(`PASS ${name}`);
};
const toggle = (name) =>
  page
    .getByRole('navigation', { name: 'Folder visibility', exact: true })
    .getByRole('button', { name: `Show ${name} bookmarks`, exact: true });
const bubble = (name) => page.locator(`a.bubble[aria-label^="${name},"]`);
async function connect(fakeClock = false) {
  context = await chromium.launchPersistentContext(
    path.join(run, 'profile'),
    options,
  );
  worker =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent('serviceworker'));
  id = new URL(worker.url()).host;
  page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  if (fakeClock)
    await page.clock.install({ time: new Date(2026, 9, 14, 8, 55, 50) });
  await page.goto(`chrome-extension://${id}/index.html`);
}
try {
  await connect(true);
  await page.getByRole('dialog', { name: 'Welcome to your orbit.' }).waitFor();
  const fixture = await worker.evaluate(async () => {
    const root = await chrome.bookmarks.create({ title: 'Spaces' });
    const work = await chrome.bookmarks.create({
      parentId: root.id,
      title: 'Work',
    });
    const research = await chrome.bookmarks.create({
      parentId: work.id,
      title: 'Research',
    });
    const personal = await chrome.bookmarks.create({
      parentId: root.id,
      title: 'Personal',
    });
    const mail = await chrome.bookmarks.create({
      parentId: work.id,
      title: 'Work mail',
      url: 'https://work.example/mail',
    });
    const docs = await chrome.bookmarks.create({
      parentId: research.id,
      title: 'Research docs',
      url: 'https://work.example/docs',
    });
    const music = await chrome.bookmarks.create({
      parentId: personal.id,
      title: 'Personal music',
      url: 'https://personal.example/music',
    });
    await chrome.history.addUrl({ url: mail.url });
    return { root, work, research, personal, mail, docs, music };
  });
  await page.getByLabel(/^Spaces/).check();
  await page.getByRole('button', { name: 'Create my orbit' }).click();
  await page.waitForFunction(
    () => document.querySelectorAll('a.bubble').length === 3,
  );
  check(
    'top controls include nested folders inside a selected parent',
    await toggle('Research').isVisible(),
  );
  check(
    'Orbit logo and title share the top row with folders below the title',
    (await page.locator('main').evaluate((el) => {
      const brand = el.querySelector('.brand').getBoundingClientRect();
      const hero = el.querySelector('.hero').getBoundingClientRect();
      const title = el.querySelector('.hero h1').getBoundingClientRect();
      const folders = el
        .querySelector('.folder-toolbar')
        .getBoundingClientRect();
      return (
        brand.width > 0 &&
        brand.left < 60 &&
        hero.top === 0 &&
        Math.abs(brand.top - title.top) < title.height * 0.2 &&
        folders.top >= hero.bottom
      );
    })) && (await page.locator('.hero').innerText()).trim().length > 0,
  );
  check(
    'Lavender dusk and hover/focus labels are the default appearance',
    (await page.locator('main.app').getAttribute('class')).includes(
      'background-dusk',
    ) && (await page.locator('a.bubble.labels-hover').count()) === 3,
  );
  await toggle('Work').dblclick();
  await page.getByRole('dialog', { name: 'Color Work', exact: true }).waitFor();
  await page.clock.fastForward(400);
  check(
    'double-click opens folder coloring without toggling its bookmarks',
    (await toggle('Work').getAttribute('aria-pressed')) === 'true' &&
      (await bubble('Work mail').count()) === 1,
  );
  await page.getByLabel('Folder color', { exact: true }).fill('#df8b57');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  const rim = (name) =>
    bubble(name).evaluate((el) =>
      getComputedStyle(el).getPropertyValue('--folder-accent').trim(),
    );
  check(
    'folder color forms an outer radial layer and is inherited by subfolders',
    (await rim('Work mail')) === '#df8b57' &&
      (await rim('Research docs')) === '#df8b57' &&
      (await bubble('Work mail').evaluate(
        (el) =>
          el.classList.contains('folder-tinted') &&
          getComputedStyle(el).backgroundImage.includes('radial-gradient'),
      )),
  );
  await toggle('Research').dblclick();
  await page.getByLabel('Folder color', { exact: true }).fill('#6e9eee');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  check(
    'a subfolder color overrides its parent without recoloring sibling bookmarks',
    (await rim('Research docs')) === '#6e9eee' &&
      (await rim('Work mail')) === '#df8b57',
  );
  await toggle('Research').dblclick();
  await page
    .getByRole('button', { name: 'Use inherited color', exact: true })
    .click();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  check(
    'clearing a subfolder color restores the parent gradient',
    (await rim('Research docs')) === '#df8b57',
  );
  await page.keyboard.press('b');
  const search = page.getByRole('searchbox', {
    name: 'Search by bookmark name or URL',
  });
  await search.waitFor();
  check(
    'B opens and focuses search',
    await search.evaluate((el) => document.activeElement === el),
  );
  await page.keyboard.type('book');
  check(
    'B keeps typing normally inside the search field',
    (await search.inputValue()) === 'book',
  );
  await page.keyboard.press('Escape');
  check(
    'automatic bubble tooltips omit the repeated activity sizing caption',
    (await page
      .getByText('Sized by your activity', { exact: true })
      .count()) === 0,
  );
  await page.mouse.click(10, 500);
  await page.locator('.folder-actions').waitFor({ state: 'detached' });
  check(
    'folder clocks stay out of the selector until hover or focus',
    (await page
      .getByRole('button', { name: 'Schedule Work', exact: true })
      .count()) === 0,
  );
  await toggle('Work').focus();
  await page.keyboard.press('ArrowDown');
  const clock = page.getByRole('button', {
    name: 'Schedule Work',
    exact: true,
  });
  await clock.waitFor();
  check(
    'hover folder actions also support keyboard focus',
    await clock.evaluate((el) => document.activeElement === el),
  );
  await page.keyboard.press('Escape');
  await toggle('Research').click();
  await bubble('Research docs').waitFor({ state: 'detached' });
  check(
    'a subfolder can be disabled without hiding its parent bookmarks or siblings',
    (await bubble('Work mail').isVisible()) &&
      (await bubble('Personal music').isVisible()),
  );
  await toggle('Research').click();
  await bubble('Research docs').waitFor();
  await toggle('Work').hover();
  await page
    .getByRole('button', { name: 'Schedule Work', exact: true })
    .click();
  check(
    'schedule editor goes straight to the toggle and time block',
    (await page
      .getByRole('button', { name: 'Automatic', exact: true })
      .count()) === 0 &&
      (await page.getByLabel('Use a schedule', { exact: true }).isVisible()),
  );
  await page.getByLabel('Use a schedule', { exact: true }).check();
  await page.screenshot({ path: path.join(run, 'folder-schedule.png') });
  await page
    .getByRole('button', { name: 'Save schedule', exact: true })
    .click();
  await bubble('Work mail').waitFor({ state: 'detached' });
  check(
    'weekday 09:00–17:00 schedule hides work before its start',
    (await bubble('Personal music').isVisible()) &&
      (await toggle('Work').getAttribute('aria-pressed')) === 'false',
  );
  await page.clock.fastForward(5 * 60_000);
  await bubble('Work mail').waitFor();
  await bubble('Research docs').waitFor();
  check(
    'an open new tab automatically shows folders when their scheduled hours start',
    (await toggle('Work').getAttribute('aria-pressed')) === 'true',
  );
  await page.screenshot({ path: path.join(run, 'folders-working-hours.png') });
  await page.getByRole('button', { name: 'Open settings' }).click();
  await page.getByLabel('Group by website', { exact: false }).check();
  await page.getByRole('button', { name: 'Close Make it yours' }).click();
  await bubble('work.example').click();
  await page
    .getByRole('dialog', { name: 'work.example', exact: true })
    .waitFor();
  await page.clock.fastForward(8 * 60 * 60_000);
  await page
    .getByRole('dialog', { name: 'work.example', exact: true })
    .waitFor({ state: 'detached' });
  check(
    'a group already open closes when all its folder members become hidden',
    true,
  );
  await page.getByRole('button', { name: 'Open settings' }).click();
  await page.getByLabel('Group by website', { exact: false }).uncheck();
  await page.getByRole('button', { name: 'Close Make it yours' }).click();
  await page.getByRole('button', { name: /All bookmarks/ }).click();
  check(
    'outside hours, hidden work pages are also absent from search and the complete list',
    (await page.locator('.result-row').count()) === 1,
  );
  await page.getByRole('button', { name: 'Close All bookmarks' }).click();
  await toggle('Work').click();
  await bubble('Work mail').waitFor();
  check(
    'manual On overrides the schedule outside hours',
    await page
      .getByRole('button', { name: 'Resume schedule for Work' })
      .isVisible(),
  );
  await toggle('Work').hover();
  await page.getByRole('button', { name: 'Resume schedule for Work' }).click();
  await bubble('Work mail').waitFor({ state: 'detached' });
  check(
    'resuming Automatic immediately restores the saved schedule',
    (await toggle('Work').getAttribute('aria-pressed')) === 'false',
  );
  await page.clock.fastForward(16 * 60 * 60_000); // Thursday 09:00
  await bubble('Work mail').waitFor();
  await toggle('Work').click();
  await bubble('Work mail').waitFor({ state: 'detached' });
  check(
    'manual Off can hide work during working hours',
    await bubble('Personal music').isVisible(),
  );
  await toggle('Spaces').click();
  await page.getByText('Your spaces are taking a break.').waitFor();
  check(
    'hidden parents gate descendant toggles and keep an obvious recovery control',
    (await toggle('Personal').isDisabled()) &&
      (await toggle('Research').isDisabled()) &&
      (await toggle('Spaces').isEnabled()),
  );
  await page
    .getByRole('group', { name: /^Research, hidden by Spaces/ })
    .focus();
  await page.keyboard.press('ArrowDown');
  check(
    'keyboard users can still edit a hidden child folder’s color and schedule',
    await page
      .getByRole('button', { name: 'Color Research', exact: true })
      .isVisible(),
  );
  await page.keyboard.press('Escape');
  await page.getByText('Your spaces are taking a break.').waitFor();
  await toggle('Spaces').click();
  await bubble('Personal music').waitFor();
  check(
    'turning a parent back on preserves a manually disabled child',
    (await bubble('Work mail').count()) === 0,
  );
  await toggle('Work').hover();
  await page.getByRole('button', { name: 'Resume schedule for Work' }).click();
  await bubble('Work mail').waitFor();
  await page.getByRole('button', { name: 'Open settings' }).click();
  const settings = page.getByRole('navigation', {
    name: 'Folder visibility settings',
  });
  await settings
    .getByRole('button', { name: 'Show Work bookmarks', exact: true })
    .hover();
  await page
    .getByRole('button', { name: 'Schedule Work', exact: true })
    .click();
  await page.getByLabel('From', { exact: true }).fill('22:00');
  await page.getByLabel('Until', { exact: true }).fill('02:00');
  for (const day of ['Monday', 'Tuesday', 'Wednesday', 'Thursday'])
    await page.getByRole('button', { name: day, exact: true }).click();
  await page
    .getByRole('button', { name: 'Save schedule', exact: true })
    .click();
  await page.getByRole('button', { name: 'Close Make it yours' }).click();
  await bubble('Work mail').waitFor({ state: 'detached' });
  check('schedules can be managed through the Bookmarks settings panel', true);
  await page.clock.fastForward(37 * 60 * 60_000); // Friday 22:00
  await bubble('Work mail').waitFor();
  await page.clock.fastForward(3 * 60 * 60_000); // Saturday 01:00
  check(
    'Friday overnight schedules remain active into Saturday',
    await bubble('Work mail').isVisible(),
  );
  await page.clock.fastForward(60 * 60_000); // Saturday 02:00
  await bubble('Work mail').waitFor({ state: 'detached' });
  check(
    'overnight schedules end at their exclusive end time',
    await bubble('Personal music').isVisible(),
  );
  await page.screenshot({ path: path.join(run, 'folders-off-hours.png') });
  check(
    'folder visibility never changes actual browser bookmarks',
    await worker.evaluate(
      async (ids) => (await chrome.bookmarks.get(ids)).length === 3,
      [fixture.mail.id, fixture.docs.id, fixture.music.id],
    ),
  );
  await toggle('Personal').click();
  await page.getByText('Your spaces are taking a break.').waitFor();
  await page.waitForFunction(
    async (folder) =>
      (await chrome.storage.local.get('preferences')).preferences.settings
        .folderRules[folder]?.mode === 'hide',
    fixture.personal.id,
  );
  await context.close();
  await connect();
  await page.getByText('Your spaces are taking a break.').waitFor();
  const restored = await worker.evaluate(
    async () =>
      (await chrome.storage.local.get('preferences')).preferences.settings
        .folderRules,
  );
  check(
    'schedules and manual folder states persist after a browser restart',
    restored[fixture.work.id].schedule.start === '22:00' &&
      restored[fixture.work.id].schedule.end === '02:00' &&
      restored[fixture.personal.id].mode === 'hide' &&
      restored[fixture.work.id].color === '#df8b57',
  );
  const second = await context.newPage();
  await second.goto(`chrome-extension://${id}/index.html`);
  await second.getByText('Your spaces are taking a break.').waitFor();
  const cachedAt = await worker.evaluate(
    async () =>
      (await chrome.storage.local.get('activityCache')).activityCache.updatedAt,
  );
  await page.bringToFront();
  await toggle('Personal').click();
  await bubble('Personal music').waitFor();
  await second.locator('a.bubble[aria-label^="Personal music,"]').waitFor();
  check('folder toggles synchronize between open new tabs', true);
  check(
    'visibility changes reuse library activity without a history rescan',
    await worker.evaluate(
      async (before) =>
        (await chrome.storage.local.get('activityCache')).activityCache
          .updatedAt === before,
      cachedAt,
    ),
  );
  await page.setViewportSize({ width: 390, height: 650 });
  await bubble('Personal music').waitFor();
  await page.waitForFunction(() => {
    const rect = document.querySelector('a.bubble')?.getBoundingClientRect();
    return (
      rect &&
      rect.left >= 0 &&
      rect.right <= innerWidth &&
      rect.top >= 0 &&
      rect.bottom <= innerHeight
    );
  });
  await toggle('Personal').focus();
  await page.screenshot({ path: path.join(run, 'folders-mobile.png') });
  check(
    'folder controls remain keyboard-accessible on narrow screens',
    await toggle('Personal').isVisible(),
  );
  check('no uncaught folder UI errors', errors.length === 0);
  console.log(
    `Completed ${checks} folder integration checks. Artifacts: ${run}`,
  );
} catch (error) {
  await page
    ?.screenshot({ path: path.join(run, 'failure.png') })
    .catch(() => {});
  throw error;
} finally {
  await context?.close();
}
