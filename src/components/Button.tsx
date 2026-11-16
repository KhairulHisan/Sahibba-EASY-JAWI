import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { fx } from '../lib/feedback';
import { Icon, type IconName } from './Icon';

type Tone = 'navy' | 'jade' | 'mango' | 'coral' | 'cream' | 'ghost';

const TONES: Record<Tone, string> = {
  navy: 'bg-navy-800 text-white hover:bg-navy-700',
  jade: 'bg-jade-500 text-white hover:bg-jade-600',
  mango: 'bg-mango-400 text-ink hover:bg-mango-500',
  coral: 'bg-coral-500 text-white hover:bg-coral-600',
  cream: 'bg-cream-50 text-ink border-2 border-cream-300 hover:bg-white',
  ghost: 'bg-transparent text-ink hover:bg-cream-200 shadow-none!',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: Tone;
  icon?: IconName;
  size?: 'md' | 'lg';
  children?: ReactNode;
  silent?: boolean;
}

export function Button({ tone = 'navy', icon, size = 'md', className = '', children, onClick, silent, type = 'button', ...rest }: ButtonProps) {
  const sizing = size === 'lg' ? 'min-h-14 px-6 text-lg rounded-2xl' : 'min-h-11 px-4 text-base rounded-xl';
  return (
    <button
      type={type}
      className={`btn-3d inline-flex items-center justify-center gap-2 font-display font-semibold tracking-wide ${sizing} ${TONES[tone]} ${className}`}
      onClick={(e) => {
        if (!silent) fx('button-tap');
        onClick?.(e);
      }}
      {...rest}
    >
      {icon && <Icon name={icon} />}
      {children}
    </button>
  );
}
