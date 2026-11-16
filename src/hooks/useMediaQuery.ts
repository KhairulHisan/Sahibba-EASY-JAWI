import { useSyncExternalStore } from 'react';

// One MediaQueryList per query: creating it on every render is surprisingly costly.
const lists = new Map<string, MediaQueryList>();
function list(query: string): MediaQueryList {
  let l = lists.get(query);
  if (!l) {
    l = window.matchMedia(query);
    lists.set(query, l);
  }
  return l;
}

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = list(query);
      m.addEventListener('change', cb);
      return () => m.removeEventListener('change', cb);
    },
    () => list(query).matches,
    () => false,
  );
}

/** Side-by-side game layout: landscape phones/tablets and desktops. */
export const WIDE_LAYOUT = '(orientation: landscape) and (min-width: 560px)';
