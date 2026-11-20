import { Icon, type IconName } from './Icon';
import { fx } from '../lib/feedback';

interface ActionDef {
  id: string;
  label: string;
  sub?: string;
  icon: IconName;
  onClick: () => void;
  disabled?: boolean;
  disabledReason?: string;
  primary?: boolean;
  badge?: string;
}

/** Bottom action bar — every control ≥ 44 px, disabled states explained via aria/title. */
export function ActionBar({ actions }: { actions: ActionDef[] }) {
  return (
    <div className="grid grid-cols-5 gap-1.5" role="toolbar" aria-label="Tindakan permainan">
      {actions.map((a) => (
        <button
          key={a.id}
          type="button"
          onClick={() => {
            fx('button-tap');
            a.onClick();
          }}
          disabled={a.disabled}
          title={a.disabled ? a.disabledReason : a.label}
          aria-label={a.disabled && a.disabledReason ? `${a.label} — ${a.disabledReason}` : a.label}
          data-testid={`action-${a.id}`}
          className={`btn-3d relative flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-xl px-1 font-display text-[11px] leading-tight font-semibold tracking-wide sm:text-xs ${
            a.primary ? 'bg-jade-500 text-white' : 'bg-navy-800 text-white'
          }`}
        >
          <Icon name={a.icon} size={20} />
          <span>{a.label}</span>
          {a.sub && <span className="text-[9px] font-bold opacity-80">{a.sub}</span>}
          {a.badge && <span className="absolute -top-1.5 -right-1 rounded-full bg-mango-400 px-1.5 text-[10px] font-extrabold text-ink">{a.badge}</span>}
        </button>
      ))}
    </div>
  );
}
