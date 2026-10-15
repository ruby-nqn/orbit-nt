// Real extension pages/storage in an isolated profile; only the page clock is controlled.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const build = path.resolve('dist');
const run = path.resolve('artifacts', `quotes-${Date.now()}`);
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
  worker,
  page,
  id,
  checks = 0;
const errors = [];
const check = (name, condition) => {
  assert.ok(condition, name);
  checks++;
  console.log(`PASS ${name}`);
};
const heading = () => page.locator('.hero h1');
const headerPrefs = () =>
  worker.evaluate(
    async () =>
      (await chrome.storage.local.get('preferences')).preferences.settings
        .header,
  );
const openSettings = async () => {
  await page
    .getByRole('button', { name: 'Open settings', exact: true })
    .click();
  await page.getByRole('button', { name: 'Header', exact: true }).click();
};
const closeSettings = () =>
  page.getByRole('button', { name: 'Close Make it yours' }).click();
const blur = () =>
  page.getByRole('heading', { name: 'Make it yours', exact: true }).click();
async function expectPool(pool) {
  await page.waitForFunction(
    (quotes) =>
      quotes.includes(document.querySelector('.hero h1')?.textContent),
    pool,
  );
}
async function connect(clock = false) {
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
  if (clock)
    await page.clock.install({ time: new Date(2026, 9, 14, 7, 59, 50) });
  await page.goto(`chrome-extension://${id}/index.html`);
}
try {
  await connect(true);
  await page.getByRole('dialog', { name: 'Welcome to your orbit.' }).waitFor();
  await worker.evaluate(async () => {
    const folder = await chrome.bookmarks.create({ title: 'Header fixtures' });
    await chrome.bookmarks.create({
      parentId: folder.id,
      title: 'Example',
      url: 'https://header.example/',
    });
  });
  await page.getByLabel(/^Header fixtures/).check();
  await page.getByRole('button', { name: 'Create my orbit' }).click();
  await page.locator('a.bubble').waitFor();
  const defaults = await headerPrefs();
  await expectPool(defaults.leisureQuotes);
  check(
    'defaults include both requested 15-quote lists and 08:00–18:00 work hours',
    defaults.rotate &&
      defaults.scheduled &&
      defaults.workStart === '08:00' &&
      defaults.workEnd === '18:00' &&
      defaults.workQuotes.length === 15 &&
      defaults.leisureQuotes.length === 15,
  );
  check(
    'a new tab before 08:00 uses Leisure quotes',
    defaults.leisureQuotes.includes(await heading().innerText()),
  );
  for (let i = 0; i < 5; i++) {
    const previous = await heading().innerText();
    await page.reload();
    await page.waitForFunction((last) => {
      const text = document.querySelector('.hero h1')?.textContent;
      return text && text !== last;
    }, previous);
    await expectPool(defaults.leisureQuotes);
  }
  check(
    'each reload picks a different eligible quote without immediate repeats',
    true,
  );
  const previousTabQuote = await heading().innerText();
  const another = await context.newPage();
  await another.clock.install({ time: new Date(2026, 9, 14, 7, 59, 50) });
  await another.goto(`chrome-extension://${id}/index.html`);
  await another.waitForFunction((last) => {
    const text = document.querySelector('.hero h1')?.textContent;
    return text && text !== last;
  }, previousTabQuote);
  check(
    'opening another new tab chooses a fresh quote across pages',
    defaults.leisureQuotes.includes(
      await another.locator('.hero h1').innerText(),
    ),
  );
  await another.close();
  await page.bringToFront();
  await page.clock.fastForward(20_000);
  await expectPool(defaults.workQuotes);
  check('an open tab switches to Work quotes automatically at 08:00', true);
  const stable = await heading().innerText();
  await page.clock.fastForward(60_000);
  await openSettings();
  check(
    'clock ticks and opening settings do not reroll the current quote',
    (await heading().innerText()) === stable,
  );
  check(
    'Header settings expose rotation, time blocks and default hours',
    (await page.getByLabel(/^Change the quote on each new tab/).isChecked()) &&
      (await page.getByLabel(/^Choose quotes by time of day/).isChecked()) &&
      (await page
        .getByLabel('Work hours start', { exact: true })
        .inputValue()) === '08:00' &&
      (await page
        .getByLabel('Work hours end', { exact: true })
        .inputValue()) === '18:00',
  );

  const cachedAt = await worker.evaluate(
    async () =>
      (await chrome.storage.local.get('activityCache')).activityCache.updatedAt,
  );
  await page
    .getByLabel('Work quotes', { exact: true })
    .fill('Work custom one.\nWork custom two.');
  await blur();
  await expectPool(['Work custom one.', 'Work custom two.']);
  await page
    .getByLabel('Leisure quotes', { exact: true })
    .fill('Rest custom one.\nRest custom two.');
  await blur();
  await page.getByLabel('Work hours start', { exact: true }).fill('09:00');
  await blur();
  await page.getByLabel('Work hours end', { exact: true }).fill('17:00');
  await blur();
  await expectPool(['Rest custom one.', 'Rest custom two.']);
  check(
    'custom quotes and changed hours save and preview immediately after leaving a field',
    (await headerPrefs()).workStart === '09:00' &&
      (await headerPrefs()).workEnd === '17:00' &&
      (await headerPrefs()).workQuotes[0] === 'Work custom one.',
  );
  check(
    'Leisure automatically fills the remaining 17:00–09:00 block',
    await page
      .getByText(
        '17:00–09:00, automatically covering all time outside Work hours.',
        { exact: true },
      )
      .isVisible(),
  );
  await closeSettings();
  await page.clock.fastForward(60 * 60_000);
  await expectPool(['Work custom one.', 'Work custom two.']);
  await page.clock.fastForward(8 * 60 * 60_000);
  await expectPool(['Rest custom one.', 'Rest custom two.']);
  check('edited blocks update an already open tab at both start and end', true);
  await openSettings();
  await page.getByLabel('Work hours start', { exact: true }).fill('17:00');
  await blur();
  await page
    .getByRole('alert')
    .filter({ hasText: 'different start and end' })
    .waitFor();
  check(
    'equal start and end times are rejected without overwriting saved hours',
    (await headerPrefs()).workStart === '09:00',
  );
  await page.getByLabel('Work hours start', { exact: true }).fill('09:00');
  await blur();
  await page.getByLabel('Work quotes', { exact: true }).fill('');
  await blur();
  await page.getByRole('alert').filter({ hasText: '1–100 quotes' }).waitFor();
  check(
    'empty quote lists are rejected and retain the last valid list',
    (await headerPrefs()).workQuotes.length === 2,
  );
  await page
    .getByLabel('Work quotes', { exact: true })
    .fill('Work custom one.\nWork custom two.');
  await blur();
  await page.getByLabel(/^Choose quotes by time of day/).uncheck();
  check(
    'time-based selection can be disabled without losing hours or quote lists',
    !(await headerPrefs()).scheduled &&
      (await page.getByLabel('Work hours start', { exact: true }).isDisabled()),
  );
  await closeSettings();
  const mixed = [
    'Work custom one.',
    'Work custom two.',
    'Rest custom one.',
    'Rest custom two.',
  ];
  await expectPool(mixed);
  const seen = new Set();
  for (let i = 0; i < 8; i++) {
    await page.reload();
    await expectPool(mixed);
    seen.add(await heading().innerText());
  }
  check(
    'time blocks off uses quotes from the combined Work and Leisure list',
    [...seen].every((text) => mixed.includes(text)) &&
      !(await headerPrefs()).scheduled,
  );

  await openSettings();
  await page.getByLabel(/^Change the quote on each new tab/).uncheck();
  await page
    .getByLabel('Fixed quote', { exact: true })
    .fill('Make room for a good day.');
  await blur();
  await page.waitForFunction(
    () =>
      document.querySelector('.hero h1')?.textContent ===
      'Make room for a good day.',
  );
  await closeSettings();
  await page.reload();
  await page.waitForFunction(
    () =>
      document.querySelector('.hero h1')?.textContent ===
      'Make room for a good day.',
  );
  await page.clock.fastForward(6 * 60 * 60_000);
  check(
    'fixed mode keeps editable text across reloads and time changes',
    (await heading().innerText()) === 'Make room for a good day.',
  );
  await openSettings();
  await page.getByLabel('Fixed quote', { exact: true }).fill('');
  await blur();
  await page
    .getByRole('alert')
    .filter({ hasText: '1–120 characters' })
    .waitFor();
  check(
    'a blank fixed quote is rejected without erasing the heading',
    (await heading().innerText()) === 'Make room for a good day.',
  );
  await page
    .getByLabel('Fixed quote', { exact: true })
    .fill('<b>A little curiosity.</b>');
  await blur();
  await closeSettings();
  check(
    'custom header text is rendered literally without HTML injection',
    (await heading().innerText()) === '<b>A little curiosity.</b>' &&
      (await heading().locator('b').count()) === 0,
  );
  await openSettings();
  await page.getByLabel(/^Change the quote on each new tab/).check();
  await page.getByLabel(/^Choose quotes by time of day/).check();
  await expectPool(['Rest custom one.', 'Rest custom two.']);
  check(
    'rotation and hour-based selection can both be reenabled with saved custom lists',
    (await headerPrefs()).rotate &&
      (await headerPrefs()).scheduled &&
      (await headerPrefs()).leisureQuotes[0] === 'Rest custom one.',
  );
  await page.screenshot({ path: path.join(run, 'header-settings.png') });
  await closeSettings();
  const requests = await page.evaluate(async () =>
    Promise.all(
      Array.from({ length: 8 }, () =>
        chrome.runtime.sendMessage({
          type: 'nextHeaderQuote',
          quotes: ['First', 'Second'],
        }),
      ),
    ),
  );
  check(
    'concurrent new-tab requests serialize quote choices without adjacent repeats',
    requests.every(
      (response, index) =>
        response.quote &&
        (!index || response.quote !== requests[index - 1].quote),
    ),
  );
  const beforeRestart = requests.at(-1).quote;
  const cdp = await context.newCDPSession(page);
  await cdp.send('ServiceWorker.enable');
  await cdp.send('ServiceWorker.stopAllWorkers');
  const recovered = await page.evaluate(async () =>
    chrome.runtime.sendMessage({
      type: 'nextHeaderQuote',
      quotes: ['First', 'Second'],
    }),
  );
  check(
    'last-quote history survives worker suspension without rescanning history',
    recovered.quote !== beforeRestart &&
      (await page.evaluate(
        async (before) =>
          (await chrome.storage.local.get('activityCache')).activityCache
            .updatedAt === before,
        cachedAt,
      )),
  );
  await cdp.detach();

  await openSettings();
  await page.getByLabel(/^Change the quote on each new tab/).uncheck();
  await page
    .getByLabel('Fixed quote', { exact: true })
    .fill('A calmer corner of the internet.');
  await blur();
  await closeSettings();
  await page.screenshot({ path: path.join(run, 'header-desktop.png') });
  await page.setViewportSize({ width: 390, height: 650 });
  await page.screenshot({ path: path.join(run, 'header-mobile.png') });
  check(
    'custom quotes remain centered and do not overflow a narrow viewport',
    await heading().evaluate((el) => {
      const r = el.getBoundingClientRect();
      return (
        r.left >= 0 &&
        r.right <= innerWidth &&
        Math.abs(r.left + r.width / 2 - innerWidth / 2) < 1
      );
    }),
  );
  await page.waitForFunction(
    async () =>
      (await chrome.storage.local.get('preferences')).preferences.settings
        .header.fixedQuote === 'A calmer corner of the internet.',
  );
  await context.close();
  await connect();
  await page.waitForFunction(
    () =>
      document.querySelector('.hero h1')?.textContent ===
      'A calmer corner of the internet.',
  );
  const restored = await headerPrefs();
  check(
    'browser restart preserves fixed mode, custom quotes and both time-block options',
    !restored.rotate &&
      restored.scheduled &&
      restored.workStart === '09:00' &&
      restored.workEnd === '17:00' &&
      restored.workQuotes.length === 2 &&
      restored.leisureQuotes.length === 2,
  );
  await openSettings();
  await page
    .getByRole('button', { name: 'Restore default header settings' })
    .click();
  const reset = await headerPrefs();
  check(
    'restoring defaults resets quotes, hours and rotation without affecting bookmarks',
    reset.rotate &&
      reset.scheduled &&
      reset.workStart === '08:00' &&
      reset.workEnd === '18:00' &&
      reset.workQuotes.length === 15 &&
      reset.leisureQuotes.length === 15 &&
      (await page.locator('a.bubble').count()) === 1,
  );
  await page.getByLabel('Work quotes', { exact: true }).fill('');
  await blur();
  await page.getByRole('alert').waitFor();
  await page
    .getByRole('button', { name: 'Restore default header settings' })
    .click();
  check(
    'restoring already-default settings also clears invalid unsaved drafts',
    (await page.getByLabel('Work quotes', { exact: true }).inputValue()) ===
      reset.workQuotes.join('\n') &&
      (await page.getByRole('alert').count()) === 0,
  );
  check('no uncaught header UI errors', errors.length === 0);
  console.log(
    `Completed ${checks} header integration checks. Artifacts: ${run}`,
  );
} catch (error) {
  await page
    ?.screenshot({ path: path.join(run, 'failure.png') })
    .catch(() => {});
  throw error;
} finally {
  await context?.close();
}
