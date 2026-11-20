import type { ReactNode } from 'react';
import { goBack } from '../state/router';
import { fx } from '../lib/feedback';
import { Icon } from './Icon';

export function ScreenHeader({ title, onBack, right }: { title: string; onBack?: () => void; right?: ReactNode }) {
  return (
    <header className="safe-top sticky top-0 z-20 flex items-center gap-2 bg-cream-100/95 px-3 pb-2 backdrop-blur-sm">
      <button
        type="button"
        onClick={() => {
          fx('button-tap');
          (onBack ?? (() => goBack()))();
        }}
        className="grid size-11 shrink-0 place-items-center rounded-full bg-cream-50 text-navy-800 ring-2 ring-cream-300 hover:bg-white"
        aria-label="Kembali"
      >
        <Icon name="back" />
      </button>
      <h1 className="min-w-0 flex-1 truncate font-display text-2xl font-semibold text-navy-900">{title}</h1>
      {right}
    </header>
  );
}
