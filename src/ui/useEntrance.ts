import { useEffect, useState } from 'react';

/** Play once per mount. Cancelling motion never replays an entrance on resume. */
export function useEntrance(enabled: boolean) {
  const [entering, setEntering] = useState(enabled);
  useEffect(() => {
    if (!enabled) setEntering(false);
  }, [enabled]);
  return {
    entering: entering && enabled,
    finishEntrance: () => setEntering(false),
  };
}
