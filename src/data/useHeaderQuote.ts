import { useEffect, useRef, useState } from 'react';
import type { HeaderSettings } from '../core/types';
import { chooseQuote, quotePool } from '../core/quotes';
import { hasBrowser } from './storage';

export function useHeaderQuote(
  settings: HeaderSettings,
  now: number,
  ready: boolean,
): string {
  const [quote, setQuote] = useState('');
  const previous = useRef('');
  // Only a changed eligible list requests another quote, not each minute or UI render.
  const key = JSON.stringify(quotePool(settings, now));
  useEffect(() => {
    if (!ready || !settings.rotate) return;
    let cancelled = false;
    const pool = JSON.parse(key) as string[];
    void (async () => {
      let next: string;
      try {
        if (!hasBrowser()) throw new Error('Local preview');
        const response = (await chrome.runtime.sendMessage({
          type: 'nextHeaderQuote',
          quotes: pool,
        })) as { quote?: string };
        if (!response?.quote || !pool.includes(response.quote))
          throw new Error('Unavailable quote');
        next = response.quote;
      } catch {
        next = chooseQuote(pool, previous.current);
      }
      if (!cancelled) {
        previous.current = next;
        setQuote(next);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [key, ready, settings.rotate]);
  return !ready ? '' : settings.rotate ? quote : settings.fixedQuote;
}
