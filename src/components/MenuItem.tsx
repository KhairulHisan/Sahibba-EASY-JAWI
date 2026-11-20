import { fx } from '../lib/feedback';
import { Icon, type IconName } from './Icon';

/** One row in a game menu sheet. */
export function MenuItem({ icon, label, onClick, disabled, tone }: { icon: IconName; label: string; onClick: () => void; disabled?: boolean; tone?: 'coral' }) {
  return (
    <button
      type="button"
      onClick={() => {
        fx('button-tap');
        onClick();
      }}
      disabled={disabled}
      className={`flex min-h-12 items-center gap-3 rounded-xl border-2 border-cream-300 bg-white px-4 text-left font-semibold hover:bg-cream-100 disabled:opacity-45 ${tone === 'coral' ? 'text-coral-700' : 'text-ink'}`}
    >
      <Icon name={icon} />
      {label}
    </button>
  );
}
