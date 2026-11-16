import { useSettings } from '../state/settings';
import { useMediaQuery } from './useMediaQuery';

/** True when animations should be minimised (app setting overrides the OS). */
export function useReduceMotion(): boolean {
  const pref = useSettings((s) => s.motion);
  const os = useMediaQuery('(prefers-reduced-motion: reduce)');
  return pref === 'reduce' || (pref === 'system' && os);
}
