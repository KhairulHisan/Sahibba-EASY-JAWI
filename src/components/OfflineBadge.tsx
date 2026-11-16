import { useSyncExternalStore } from 'react';
import { Icon } from './Icon';

const subscribe = (cb: () => void) => {
  window.addEventListener('online', cb);
  window.addEventListener('offline', cb);
  return () => {
    window.removeEventListener('online', cb);
    window.removeEventListener('offline', cb);
  };
};

/** Shown when the device is offline — single player keeps working. */
export function OfflineBadge() {
  const online = useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
  if (online) return null;
  return (
    <div className="pointer-events-none fixed bottom-2 left-2 z-[55] flex items-center gap-1.5 rounded-full bg-navy-900/90 px-3 py-1.5 text-xs font-bold text-white" role="status">
      <Icon name="wifiOff" size={14} /> Luar talian — Single Player tetap boleh dimainkan
    </div>
  );
}
