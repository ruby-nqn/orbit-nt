# Orbit New Tab

A private, activity-aware New Tab extension for Vivaldi and Chromium. Real browser bookmarks become floating glass bubbles; available browsing history gently changes their sizes. No account, telemetry, remote services, website injection, or CDN assets.

## Install in Vivaldi

The ready-to-load extension is in **`dist/`**. No build tools are needed to load that directory.

1. Open `vivaldi://extensions`.
2. Enable **Developer mode**, choose **Load unpacked**, and select this project's **dist** directory (the directory containing `manifest.json`).
3. In Vivaldi **Settings → Tabs → New Tab Page**, select **Start Page** and enable **Controlled by Extension**. This Vivaldi preference is required for third-party New Tab overrides. See [Vivaldi's official instructions](https://help.vivaldi.com/desktop/navigation/start-page/).
4. Open a new tab. Read the short privacy explanation, choose bookmark folders, and select **Create my orbit**. Selecting a folder includes its descendants.

Keep the installed directory at the same location. After rebuilding, click **Reload** on the extension's card. If another extension controls New Tab, disable that extension's override. Chromium and Edge use the same Load unpacked flow on their extensions pages.

## Everyday use

- Click a bubble to open its bookmark in the current tab. Ctrl/Cmd-click, middle-click and Shift-click use normal browser link behavior.
- Drag more than 6 px to reposition a bubble. Its normalized coordinates survive new tabs, viewport changes, and restarts. Collision resolution can move conflicting anchors slightly.
- Right-click a bubble, or focus it and press **Shift+F10**, for opening, pinning, colors, fixed sizes, activity, hiding, editing, and removal. Removing always requires confirmation and changes the actual browser bookmark; hiding only changes Orbit.
- Press **B**, **/** or the search icon to search names and URLs. Shortcuts stay inactive while typing in a field. Use ↑/↓ and Enter in search. Tab reaches individual bubbles and all controls. Escape closes panels.
- **All bookmarks** contains every currently visible entry, including overflow. Small viewports and large collections automatically use more compact circles and overflow; bookmarks never disappear because of insufficient canvas space.
- Optional **Group by website** combines identical hostnames (including ports). Click a group to explore, edit or remove individual pages. Exact-page mode remains the default.
- Settings preview immediately and save automatically. Dark, light, system theme, local background images, labels, glass, spacing, motion, scoring and size limits are configurable.
- **Settings → Header** controls the quote, its Work/Leisure time blocks, and an optional fixed heading.
- Folder chips below the title independently toggle folders and nested subfolders. The Orbit logo sits at the top left. Hover a chip for its clock/color popup; double-click it to choose a folder color. The same controls are in **Settings → Bookmarks → Folder visibility & schedules**. With keyboard focus on a chip, ↓ opens its actions and Escape closes them.
- **Lavender dusk** and **On hover & focus** labels are the default appearance. Previous installed defaults migrate once; other appearance selections remain. Explicit choices in imported preference files are retained.
- Pinning freezes the current target diameter and prioritizes the position. Manual fixed sizes can also be set without pinning. Turning fixed sizing off restores automatic sizing. Dense viewports may still compact fixed bubbles.

## Folder visibility and working hours

Keep **Work** and **Personal** folders in your selected library, then use their top chips to show or hide them without changing browser bookmarks. Subfolders can be turned off even when their parent is included. A hidden parent hides all its descendants; turning it back on preserves each child's own visibility setting. The toolbar scrolls horizontally when there are many folders, and Tab reaches its controls.

To show Work only from **09:00 to 17:00, Monday–Friday**:

1. Hover **Work** and click the clock in its small popup.
2. Enable **Use a schedule** and choose **From 09:00**, **Until 17:00**.
3. Select **Weekdays**, then **Save schedule**.

The schedule editor contains the scheduling toggle, time range and repeat days. Saving resumes the schedule; disabling scheduling makes the folder available all day. A single click on the folder chip manually shows or hides it. This override persists until you use **Resume schedule** in its hover popup or save its schedule again.

Schedules use the device's **local timezone** and selected weekdays. Start times are inclusive and end times exclusive: Work disappears at 17:00. Overnight windows are supported: Friday 22:00–02:00 includes early Saturday until 02:00. Selected weekdays belong to the **starting day**. Equal start/end times and empty weekday selections are rejected; disable the schedule for all-day visibility. Parent and child schedules intersect.

Visibility updates on open, on returning to a tab, and at local minute boundaries while the page is visible. Clock or timezone changes reconcile on the next minute/focus refresh. No alarms, new permissions or history polling are used. Hidden folders are excluded from the bubble canvas, search, **All bookmarks**, and group members, while Settings keeps them manageable. Positions, colors and activity sizes are retained for when folders return. Visibility changes reuse the full selected-library activity cache, so toggling or crossing a scheduled boundary does not rescan history or shrink unrelated bubbles.

Folder rules are saved locally, synchronize across open Orbit pages, survive restarts, and are included in validated JSON exports. Existing preferences without folder rules load with their previous visibility. One daily time window per folder is supported, with independently selectable days.

Turning a folder off gives its bubbles a quick 180 ms pop-and-fade exit. They leave search, the complete list, and keyboard navigation immediately; only inert visual snapshots remain during the animation. Restoring a folder during the fade cancels its exit. Animation completion and a bounded cleanup timer remove snapshots, and disabling motion, enabling reduced motion, or hiding the tab removes them immediately. Scheduled folder hiding uses the same effect. The empty state appears after the last exit finishes.

Double-click a folder chip to choose its bookmark color without toggling visibility. The selected color forms the bubble's outer layer and blends inward to the favicon-derived color (or individual bubble override). Nested folders inherit the nearest parent's color until given their own. **Use inherited color** clears a folder's color without changing its visibility or schedule. In website grouping mode, the first visible bookmarked page supplies the representative folder color, matching the favicon/page used for the group. Folder color choices persist and are included in JSON exports.

## Header quotes

Every new tab or reload picks a fresh header quote from the active list. **Work hours** default to **08:00–18:00** and **Leisure hours** automatically cover **18:00–08:00**. Both lists include the 15 supplied quotes. In **Settings → Header**, edit each list with one quote per line and adjust the Work start/end times; Leisure always fills the remaining time so the two blocks cannot overlap or leave gaps. Hours apply every day, in the device's local timezone, independently of bookmark-folder schedules. Overnight Work hours are supported. Starts are inclusive and ends exclusive.

- **Change the quote on each new tab** enables rotation. Turn it off and edit **Fixed quote** to keep the same header on every tab and at every hour.
- **Choose quotes by time of day** switches between the Work and Leisure lists. Turn it off to mix both lists throughout the day. Each toggle can be reenabled without losing custom text or hours.
- Text and time edits validate and save when you leave the field; switches save immediately. Each list needs 1–100 quotes, each 1–120 characters. Empty lists, blank fixed text and equal start/end times retain the last valid settings and show an error.

An open, visible page switches quotes when the time block changes and reconciles time after returning from sleep or a hidden tab. Other settings, search, clock ticks and bookmark updates keep the current quote stable. Quote choices are serialized across tabs and the last chosen text is stored locally to avoid immediate repeats, including after a worker/browser restart. A list containing only one distinct quote necessarily reuses it. Quotes are displayed as plain text, never HTML. Header configuration is included in JSON exports; the last chosen quote is internal metadata and is excluded. Older preference files acquire the new default configuration while retaining their bookmark and appearance choices.

## Development

Use Node.js **22.12+** (Node 24 LTS recommended) and npm. Dependencies are locked in `package-lock.json`.

```sh
npm ci
npm run dev
npm run check
```

`npm run dev` serves the interface for development; browser APIs are only available in the loaded extension. It deliberately shows setup guidance rather than fabricated bookmarks or visit data. `npm run build` creates the standalone Manifest V3 build in `dist/`.

Commands:

| Command                           | Purpose                                                            |
| --------------------------------- | ------------------------------------------------------------------ |
| `npm run typecheck`               | Strict TypeScript checking                                         |
| `npm run lint`                    | ESLint checks                                                      |
| `npm test`                        | Pure engine and history adapter unit tests                         |
| `npm run build`                   | Type check and production extension build                          |
| `npm run check`                   | All four checks above                                              |
| `npx playwright install chromium` | Install the isolated integration test browser                      |
| `npm run test:browser`            | Test the built extension with real browser APIs in a fresh profile |
| `npm run test:folders:browser`    | Test nested toggles and schedules using a controlled page clock    |
| `npm run test:quotes:browser`     | Test header rotation, time blocks, fixed mode and persistence      |

An installed Chromium-based browser may be supplied with `ORBIT_BROWSER`. For example in PowerShell:

```powershell
$env:ORBIT_BROWSER = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
npm run test:browser
```

The integration suite exclusively creates test bookmarks/history in a new profile under ignored `artifacts/`. It never opens your normal browser profile. Screenshots, preference exports, and failure artifacts are retained there for inspection. Fixture data is confined to tests. PNG extension icons are bundled; Windows developers can regenerate them with `scripts/generate-icons.ps1`.

## Scoring

The default horizon is **seven local calendar days**, including today. Boundaries are local midnights computed with calendar-date arithmetic, so daylight saving days do not have to be 24 hours long. Future timestamps, unavailable timestamps, duplicate visit IDs and subframe transitions are excluded. Top-level reloads and redirects recorded by the browser count as visits.

| Bucket          | Calendar coverage                                   | Default weight |
| --------------- | --------------------------------------------------- | -------------- |
| Today           | Today's midnight through now                        | 55%            |
| Previous 2 days | Midnight two days ago through today's midnight      | 30%            |
| Previous 4 days | Midnight six days ago through midnight two days ago | 15%            |

Weights multiply **total visits in each bucket**, not daily averages:

```text
score = 0.55 × today + 0.30 × previous2 + 0.15 × previous4
normalized = min(1, log(1 + score) / log(41))
targetDiameter = minSize + (maxSize - minSize) × normalized
```

This fixed logarithmic curve has diminishing returns, saturates at score 40, and does not let an unrelated active bookmark change another bookmark's target diameter. Defaults are **64–160 px**. Zero history gives a 64 px target; it never hides an entry. User limits clamp fixed sizes as well. Disabling automatic resizing uses a uniform 88 px target clamped to those limits.

Presets: **Today** uses 100/0/0; **Last 3 days** uses 65/35/0; **Last 7 days** uses 55/30/15; **Balanced** uses 25/35/40 to emphasize the older part of the same seven-day horizon. **Custom** normalizes the three nonnegative user weights by their sum. At least one weight must be positive.

`chrome.history.search` discovers at most 5,000 recent unique URLs, then up to eight concurrent `getVisits` calls retrieve actual visit timestamps for relevant URLs. Lifetime `HistoryItem.visitCount` is never used as a recent count. The browser cannot date-bound `getVisits`; Orbit filters the returned records. At the search limit or on individual failures, the interface explicitly reports incomplete counts. Missing, restricted, cleared, incognito or expired history is **unknown/absent**, represented by zero available visits; Orbit never reconstructs or invents it. API behavior is described in the [Chrome History reference](https://developer.chrome.com/docs/extensions/reference/api/history).

## URL identity

Browser bookmark IDs preserve each entry through renames and moves. Duplicate bookmarks stay separate in exact mode but read one canonical activity total; the status summary deduplicates them too.

Canonicalization uses the URL parser: lowercase hostnames, normalized default ports, root slashes and dot segments, with fragments removed. Scheme, path case, percent-encoded semantics, query order and **all query parameters** remain intact. Non-root trailing slashes are deliberately preserved because `/page` and `/page/` can serve different resources. HTTP and HTTPS, `www` and non-`www`, and subdomains remain distinct. This conservative policy avoids assigning one page another page's activity.

HTTP(S), FTP, file, and Chromium/Vivaldi/Edge internal URLs are supported as bookmark destinations. Script, data, extension and malformed URLs are excluded; actual bookmarks remain untouched. Some browser-internal or local-file destinations are restricted by the browser and may require file access or manual navigation.

## Collision and positioning

`core/layout.ts` is a lightweight deterministic packing solver, with no continuous physics loop or D3 dependency:

1. Prioritize pinned entries, then manual positions, then descending activity.
2. Estimate available circle area; compact targets when necessary while keeping a useful click target.
3. Use persisted normalized anchors, or a deterministic golden-angle scatter that places important entries toward the center.
4. Check each circle against every accepted circle, reserving the requested spacing plus 8 px for hover/idle motion. Search progressively around a conflicting anchor for the closest sampled valid placement.
5. Put anything that cannot be safely placed into the complete, searchable list. Work is bounded to 160 canvas candidates and 2,000 relocation samples per candidate, even for thousands of bookmarks.

Pinned positions are strong preferences rather than impossible hard constraints. Two pins at the same coordinate resolve into separate valid circles. Automatic coordinates are cached; manually chosen coordinates remain explicit anchors. Center attraction also influences saved automatic positions while leaving manual anchors in place. CSS animates settled size and coordinate changes; restrained idle translation uses only transforms. The header fades in over 480 ms when its text changes, and newly appearing bubbles make a subtle 260 ms entrance from the canvas center to their settled positions, with at most 24 ms of stagger. These one-time effects use separate transform/opacity layers, preserving drag, idle motion and saved positions. Bubble entrances finish immediately on focus or pointer interaction. All entrance effects are cancelled when motion is disabled, the tab is hidden, or reduced motion is enabled; resuming does not replay them. Layout recomputes on meaningful inputs and viewport resize, not on animation frames. Hidden tabs pause motion and defer scans; system reduced motion overrides the animation setting.

## Architecture and lifecycle

```text
src/background.ts       MV3 listeners, persistent invalidation, coalesced snapshots
src/data/history.ts     Bounded history discovery, visit counting, cache policy
src/data/storage.ts     Chrome storage and worker messaging boundary
src/data/useOrbit.ts    Cached-first UI, event refresh, ordered preference writes
src/core/bookmarks.ts   Tree flattening, selection, identity and optional grouping
src/core/folders.ts     Nested visibility, weekday schedules and manual overrides
src/data/useFolderTime.ts  Shared folder/header minute clock; no browser data polling
src/data/useHeaderQuote.ts  Stable per-page quotes and time-block changes
src/core/quotes.ts       Quote defaults, local time blocks, selection and validation
src/core/urls.ts         Safe destination and canonical URL policy
src/core/scoring.ts      Calendar buckets, presets, bounded sizing
src/core/layout.ts       Deterministic collision packing and overflow
src/core/colors.ts       Readable local favicon extraction and hash fallback
src/core/settings.ts     Defaults, schema validation, versioned import/export
src/ui/                 Bubbles, favicons, accessible dialogs, settings
src/App.tsx             New Tab composition and user interactions
```

On opening, the page reads bookmark, layout and activity caches immediately, then requests a fresh bookmark tree. History caches are reused for up to 15 minutes if the selected library signature, local day and persistent history revision match. Folder visibility and schedules filter the UI separately from the library, keeping cached activity stable as folders turn on/off. Relevant visit events invalidate counts; bookmark events trigger tree refresh; history removal immediately removes derived cached activity. Visible pages debounce event refreshes by 800 ms and resynchronize at local midnight and when shown again. No high-frequency history polling or alarm permission is needed.

Listeners register synchronously at worker startup. Dirty tokens and caches live in `storage.local`, so correctness does not depend on a long-running worker. Requests are coalesced while a scan runs. A revision/selection check prevents a scan that raced with a browser event from marking old data as current. The UI retries mismatched selection snapshots. Browser startup and extension installation/update invalidate caches while preserving preferences. Bookmark data is reread on each New Tab as a restart safety net; this is inexpensive compared with history discovery. Header selection uses a separate small serialized request that reads/writes only the last quote; it does not run a history scan.

Favicons use Chromium's **local `_favicon` endpoint**, with no host permissions or third-party favicon service. When pixels are readable, Orbit extracts a hue from colored pixels and normalizes saturation/lightness. A browser default-icon comparison detects missing favicon imagery and supplies a title initial. Protected canvas pixels, monochrome icons and missing images use a deterministic hostname color. Manual colors take priority. See [Chrome's favicon documentation](https://developer.chrome.com/docs/extensions/how-to/ui/favicons).

## Privacy and permissions

| Permission  | Use                                                                                |
| ----------- | ---------------------------------------------------------------------------------- |
| `bookmarks` | Read and monitor bookmarks; edit/create/remove only through explicit user controls |
| `history`   | Read available recent visit timestamps and receive invalidation events             |
| `storage`   | Save preferences, normalized coordinates and derived caches locally                |
| `favicon`   | Read browser-cached favicon imagery                                                |

No `tabs` permission is requested: creating a new tab does not require access to sensitive tab data. There are no host permissions, content scripts, remote fonts, analytics, accounts or server calls. All executable assets are bundled. CSP restricts scripts to the extension and blocks outbound connections. React escapes bookmark labels; URLs and imported settings are validated. Local background images must be PNG/JPEG/WebP data, at most 2 MB. All preferences stay in `storage.local`; profile-specific IDs, local images and browsing-derived data are intentionally not synced. Exported preferences exclude history and visit counts.

Clearing cached activity deletes derived counts only and rebuilds from available browser history. Resetting position data affects Orbit only. Neither operation deletes actual browser history or bookmarks.

## Verification and limitations

Automated unit tests cover weighted scoring, no/zero history, logarithmic bounds, min/max and fixed sizes, URL matching, duplicates, additions/deletions/moves, pins, colors, dense layouts, viewport changes, collisions, cache invalidation and import/export validation. The Playwright suite loads the production extension and exercises real bookmark/history APIs, onboarding, live updates, editing, confirmed removal, colors, dragging, grouping, hidden entries, export validation, overflow, reduced motion, service-worker wakeup and browser restart.

Verification: **101 unit tests** pass; type checking, linting and the production build pass. The integration suites cover **33 base extension checks**, **33 folder checks** and **25 header checks** in isolated **Microsoft Edge Chromium** profiles. They include New Tab replacement, history-driven sizing, conventional navigation, worker recovery, nested toggles, weekday/overnight schedules, automatic transitions in an open tab, quote rotation across pages, edited time blocks/lists, fixed mode, validation, cache reuse, cross-tab synchronization and browser restart. **Manual testing of Vivaldi's native “Controlled by Extension” preference and normal user-profile behavior remains necessary**; Vivaldi's headless automation launcher was unavailable in this environment. The downloaded Chrome for Testing executable also could not start here, so the working installed Edge browser was used.

Known limitations:

- History discovery is capped at 5,000 recent URLs with a visible partial-count warning. Chrome does not offer paginated, date-bounded visit-detail queries. Domain aggregation therefore represents available discovered history, not an invented total.
- Dense layouts compact fixed and minimum targets as needed and use overflow. Transitions can momentarily cross paths; final positions satisfy collision constraints. There is no pan/zoom canvas or perpetual physical simulation.
- Bookmark/folder IDs in imports belong to their original profile. Appearance is portable, but another profile requires folder reselection; ID-specific customizations may not transfer.
- Concurrent edits in separate New Tab pages use the last saved preference snapshot. Within a page, writes are serialized and optimistic controls are protected from older own-write events.
- Favicons depend on the browser's local cache. Unvisited or uncached sites show initials. No external fetch is attempted. Headless Edge does not populate the favicon cache through navigation in this test setup; automated rendering checks cover the initials fallback. Cached website favicon appearance should also be checked manually in Vivaldi. Internal/file bookmarks have whatever navigation restrictions Vivaldi applies.
- A browser or operating-system timezone change is fully reconciled on the next visibility/open refresh. Incognito history is not inferred; the extension is not enabled for incognito by default.

Potential future work: optional opt-in wider history discovery, portable URL-based customization remapping, virtualized very-large lists, cross-page preference conflict merging, and keyboard position nudging.
