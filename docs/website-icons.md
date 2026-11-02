# Website icon discovery

The new-tab page never waits for icon discovery. `Favicon.tsx` displays Chromium’s `_favicon` endpoint (the existing `favicon` permission), detects its generic placeholder, and falls back to the bookmark initial. `icons/client.ts` reads IndexedDB asynchronously, predecodes cached/replacement images, and shares subscriptions for identical canonical page URLs. Icon upgrades do not recalculate bubble colors or alter the layout. The default icon scale for new preferences is 48%; existing saved size preferences remain in effect. Transparent padding receives at most 18% optical compensation, bounded to 70% of the bubble.

## Architecture and MV3 lifecycle

- `icons/background.ts` validates extension messages against current bookmarks and serializes creation/closure of a temporary `offscreen.html`. It registers event listeners synchronously and does not rely on service-worker globals for persistent correctness.
- `icons/offscreen.ts` handles discovery requests. The hidden document supports inert HTML parsing, DOMParser for SVG validation, image decoding, canvas measurement, and IndexedDB. It is closed after the request batch. No content scripts or ordinary-site DOM injection are used.
- `icons/resolver.ts` deduplicates page jobs and shared asset downloads, with two concurrent discovery jobs. `icons/network.ts` independently limits all requests to four concurrent fetches. Multiple new tabs share the offscreen queue.
- `icons/cache.ts` stores page records and shared image Blobs in IndexedDB `orbit-icons`. Preferences and history storage remain independent.

Chrome’s service worker has no DOMParser or image DOM. An offscreen extension document is used rather than pretending these APIs exist in a worker. See [Chrome offscreen documentation](https://developer.chrome.com/docs/extensions/reference/api/offscreen) and [extension cross-origin requests](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests).

## Discovery and selection

Page identity preserves scheme, hostname/port, path, trailing slash, and query parameters; fragments are removed. Bookmarks from the same origin retain independent page-specific branding. Multiple entries can point to the same stored icon asset without duplicating its bytes.

1. Fetch the exact bookmarked HTTP(S) page, without cookies or referrer. Parse its markup inside a detached inert template; scripts, images, iframes, and other resources are never attached to a live DOM. Resolve `<base href>` and relative links against the final document URL.
2. Collect `icon`, `shortcut icon`, `apple-touch-icon`, and `apple-touch-icon-precomposed` declarations. Fetch up to two declared web manifests and inspect their bounded `icons` arrays, including dimensions, MIME type, and purpose. Resolve manifest assets relative to the final manifest URL.
3. If the page declares no candidates, share origin-homepage metadata as a fallback. Never substitute origin branding for working page-specific declarations.
4. Deduplicate and shortlist up to eight declared candidates, reserving a full-color raster alternative when SVG declarations dominate. If the measured result is insufficient, try `/apple-touch-icon.png`, `/favicon.svg`, `/favicon-192x192.png`, and `/favicon.ico` (up to twelve asset attempts total).
5. Validate/decode images before scoring. The score combines actual resolution relative to a 192px physical target, safe full-color vector suitability, source, square aspect ratio, visible content bounds, alpha coverage, and a conservative repeated-edge detail heuristic. Monochrome-only and maskable-only variants receive penalties. Declared dimensions only prioritize downloads; they cannot make a 16px image score as 512px.
6. Store the best usable result. Raster animation is frozen and images are normalized to transparent PNG, at most 512px on the longest axis. Safe SVGs stay vector images. Chromium favicons and initials remain the final fallback.

## Caching

Page records contain the canonical page key, selected asset URL/source, intrinsic dimensions, vector/coverage/transparency/detail measurements, retrieval timestamp, and expiry. Assets are keyed by their declared URL. Successful selections and assets revalidate after 14 days. Negative results retry after one day. A failed refresh retains known-good bytes and retries the next day.

Opening another new tab or restarting the browser reads cached image Blobs without website requests while fresh. Unknown or stale selections resolve asynchronously. Missing asset references trigger discovery. URL edits naturally use a new page key. Orphaned and old entries are bounded through pruning: at most 4,000 page records, 1,024 assets, and 64 MiB of image payload. Storage can be evicted by the browser; fallbacks still work. Derived image data is not included in preference exports.

## Permissions and security

New permissions:

- `offscreen`, reasons `DOM_PARSER` and `BLOBS`.
- `host_permissions`: `http://*/*`, `https://*/*`. Universal automatic direct discovery needs cross-origin website access; optional per-site prompts would require manual action. No `tabs`, scripting, webRequest, or content-script permissions are added.
- CSP permits HTTP/HTTPS connections but continues to allow only bundled scripts and local/data/blob images. Remote HTML or SVG markup is never inserted into the application DOM. Downloaded images render through local Blob URLs.

Only HTTP(S) URLs without embedded credentials are accepted; HTTPS-to-HTTP downgrades are rejected. Metadata redirects to different hostnames (apart from `www`) are not trusted as the original page’s branding; explicitly declared cross-origin CDN assets and manifests are allowed. Requests omit credentials and referrers. They still disclose an ordinary request and IP address to the destination site, which is explained in onboarding, settings, and the public README.

Limits: 6.5-second fetch timeout, 25-second job budget, 768 KB HTML prefix, 192 KB manifest, 2 MB image response, 256 KB SVG text, 4,000 SVG elements, 4,096px maximum intrinsic dimension, and 16 megapixels maximum decoded image. The new-tab client queues at most two runtime requests at a time; the offscreen queue provides shared limits across tabs. Large HTML pages are inspected using only the bounded prefix, then the response is canceled. Oversized manifests and images are rejected. Streamed response bodies are counted even without Content-Length. Status, MIME, signatures, successful decoding, dimensions, and nonempty content are checked; common raster headers are checked before decoding. SVGs with active tags, external image/use references, scripts, event attributes, entities, unsafe URL styles, or external stylesheet imports are rejected. Internal SVG references are permitted; static SVG images preserve their vector form.

## Validation and limitations

`npm run test:icons:browser` loads the real built MV3 extension into an isolated browser profile. Local test websites cover PWA manifests/base URLs, 512px versus false declarations, SVG quality and safety, internal padding, MIME mismatches, broken icons/manifests, exact-page branding, redirects, absent/blocked/oversized/timed-out pages, negative cache, concurrent requests, cache reuse across new tabs and restarts, bookmark URL edits, stale offline fallback, and temporary offscreen lifetime. `ORBIT_BROWSER` can specify an installed Chromium browser. Set `ORBIT_ICON_LIVE=1` to also record discovery outcomes for ChatGPT, Reddit, YouTube, Steam, Google Drive, and GitHub in ignored `artifacts/`.

Unit tests in `tests/icons.test.ts` cover URL policies, manifest validation/deduplication, quality ranking, alpha bounds, freshness, concurrency, request credentials, HTTP failures, streamed size limits, and redirects. Other project suites continue to cover bookmark, history, layout, folder, and interaction behavior.

Verification on 2026-11-02: type checking, ESLint, 142 unit tests, and the production build passed. The isolated Edge suites passed 148 browser checks (33 general, 33 folder, 25 header, 13 drag, 44 icon checks), including conventional-path discovery and recovery from corrupt stored images. No native Vivaldi session was used.

Public-site smoke checks from the same isolated profile found GitHub’s 512px manifest PNG, Steam’s 256px ICO, YouTube’s 144px declared PNG, Reddit’s 64px PNG, and Google Drive’s 32px ICO. ChatGPT did not expose a usable resource to these requests and retained the browser/initial fallback. These observations are access-dependent, not guarantees that those sites will always expose the same assets. The full discovery/selection behavior is verified by controlled local websites independently of public-site availability.

Unavoidable limits: websites can block requests or require login/JavaScript before exposing metadata. No cookies are sent, JavaScript is not executed, and no protected image is bypassed. Restricted host access, unsupported SVG features, non-HTTP bookmarks, and websites with only tiny icons retain the normal fallback. ICO decoding uses Chromium’s available image decoder. A heuristic can penalize obvious repeated-edge upscales but cannot reliably prove all synthetic image enlargement. Large opaque padding and deliberate brand whitespace cannot always be distinguished automatically. Adaptive media-theme SVGs use the offscreen renderer’s environment. Native Vivaldi verification remains separate from automated Chromium-family tests.

Potential improvements include theme-aware SVG/media selection, dedicated multi-frame ICO inspection, and more precise optical sizing for opaque icons with built-in whitespace.
