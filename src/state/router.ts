import { useSyncExternalStore } from 'react';

export type Route =
  | 'splash'
  | 'home'
  | 'single'
  | 'game'
  | 'results'
  | 'multi'
  | 'tutorial'
  | 'kamus'
  | 'tetapan'
  | 'sejarah'
  | 'guru';

const PATHS: Record<Route, string> = {
  splash: '/',
  home: '/main',
  single: '/single',
  game: '/permainan',
  results: '/keputusan',
  multi: '/multi',
  tutorial: '/tutorial',
  kamus: '/kamus',
  tetapan: '/tetapan',
  sejarah: '/sejarah',
  guru: '/guru',
};

const BY_PATH = new Map(Object.entries(PATHS).map(([r, p]) => [p, r as Route]));

export function parseHash(hash: string): Route {
  const path = hash.replace(/^#/, '').split('?')[0] || '/';
  return BY_PATH.get(path) ?? 'home';
}

function subscribe(cb: () => void) {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
}

export function useRoute(): Route {
  return useSyncExternalStore(subscribe, () => parseHash(window.location.hash), () => 'splash');
}

export function navigate(route: Route, opts: { replace?: boolean } = {}) {
  const target = '#' + PATHS[route];
  if (window.location.hash === target) return;
  if (opts.replace) window.location.replace(target);
  else window.location.hash = target;
}

export function goBack(fallback: Route = 'home') {
  if (window.history.length > 1) window.history.back();
  else navigate(fallback, { replace: true });
}
