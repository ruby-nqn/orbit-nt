import { resolveIcon } from './resolver';
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (
    sender.id !== chrome.runtime.id ||
    message?.target !== 'orbit-icon-offscreen' ||
    typeof message.url !== 'string'
  )
    return false;
  void resolveIcon(message.url).then(
    (record) => respond({ record }),
    () => respond({ error: 'Icon discovery unavailable' }),
  );
  return true;
});
