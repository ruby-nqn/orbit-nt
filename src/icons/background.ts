import { iconPage } from './policy';
import { flattenBookmarks } from '../core/bookmarks';

let lifecycle = Promise.resolve();
let pending = 0;
let allowed: Promise<Set<string>> | undefined;
const invalidate = () => {
  allowed = undefined;
};
chrome.bookmarks.onChanged.addListener(invalidate);
chrome.bookmarks.onCreated.addListener(invalidate);
chrome.bookmarks.onRemoved.addListener(invalidate);
chrome.bookmarks.onImportEnded.addListener(invalidate);

function withDocument() {
  lifecycle = lifecycle
    .catch(() => undefined)
    .then(async () => {
      // clients.matchAll supports Chrome 111 as well as newer runtime.getContexts.
      const worker = globalThis as unknown as {
        clients: { matchAll(): Promise<{ url: string }[]> };
      };
      const documents = await worker.clients.matchAll();
      if (
        !documents.some(
          (client) => client.url === chrome.runtime.getURL('offscreen.html'),
        )
      )
        await chrome.offscreen.createDocument({
          url: 'offscreen.html',
          reasons: [
            chrome.offscreen.Reason.DOM_PARSER,
            chrome.offscreen.Reason.BLOBS,
          ],
          justification:
            'Parse bookmarked website icon metadata and validate and cache high-resolution icon images.',
        });
    });
  return lifecycle;
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (
    sender.id !== chrome.runtime.id ||
    sender.url !== chrome.runtime.getURL('index.html') ||
    message?.type !== 'resolveWebsiteIcon'
  )
    return false;
  const key = typeof message.url === 'string' ? iconPage(message.url) : null;
  if (!key) {
    respond({ error: 'Unsupported website' });
    return false;
  }
  pending++;
  void (async () => {
    allowed ??= chrome.bookmarks.getTree().then(
      (tree) =>
        new Set(
          flattenBookmarks(tree)
            .bookmarks.map((b) => iconPage(b.url))
            .filter((url): url is string => !!url),
        ),
    );
    if (!(await allowed).has(key))
      throw new Error('Only bookmarked websites can be resolved');
    await withDocument();
    return chrome.runtime.sendMessage({
      target: 'orbit-icon-offscreen',
      url: key,
    });
  })()
    .then(respond, () => respond({ error: 'Icon discovery unavailable' }))
    .finally(() => {
      pending--;
      // No permanent background page: close after the batch, serialize with creation.
      lifecycle = lifecycle
        .catch(() => undefined)
        .then(async () => {
          if (pending === 0)
            await chrome.offscreen.closeDocument().catch(() => undefined);
        });
    });
  return true;
});
