import type { CSSProperties } from 'react';
import { useEntrance } from './useEntrance';

export function HeaderTitle({
  quote,
  motion,
}: {
  quote: string;
  motion: boolean;
}) {
  const { entering, finishEntrance } = useEntrance(motion && !!quote);
  return (
    <h1
      className={entering ? 'title-entering' : undefined}
      onAnimationEnd={finishEntrance}
      style={
        {
          '--quote-scale': Math.max(0.5, Math.min(1, 48 / (quote.length || 1))),
        } as CSSProperties
      }
    >
      {quote}
    </h1>
  );
}
