import { AnimatePresence, motion, useIsPresent, type HTMLMotionProps } from 'motion/react';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Icon } from './Icon';

/**
 * Accessible modal: bottom sheet on phones, centred dialog on wide screens.
 * Escape closes, focus moves inside on open and returns on close.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  dismissible = true,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  dismissible?: boolean;
  wide?: boolean;
}) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Runs only when the sheet opens/closes — NOT on every parent render, which
  // previously pulled focus out of the dialog (e.g. every second with a timer).
  useEffect(() => {
    if (!open) return;
    const restore = document.activeElement as HTMLElement | null;
    const t = window.setTimeout(() => {
      const first = panel.current?.querySelector<HTMLElement>('[data-autofocus], button, input, select, textarea, [href]');
      first?.focus();
    }, 30);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissible) {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !panel.current) return;
      // Keep keyboard focus inside the dialog.
      const items = Array.from(panel.current.querySelectorAll<HTMLElement>('button:not([disabled]), input, select, textarea, [href], [tabindex]:not([tabindex="-1"])'));
      if (items.length === 0) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      } else if (!panel.current.contains(document.activeElement)) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('keydown', onKey);
      restore?.focus?.();
    };
  }, [open, dismissible]);

  return (
    <AnimatePresence>
      {open && (
        <ExitSafe
          key="sheet"
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          <div className="absolute inset-0 bg-navy-950/55" onClick={() => dismissible && onCloseRef.current()} aria-hidden="true" />
          <motion.div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className={`relative max-h-[88dvh] w-full overflow-y-auto rounded-t-3xl border-2 border-cream-300 bg-cream-50 p-5 pb-8 shadow-2xl sm:rounded-3xl sm:pb-5 ${wide ? 'sm:max-w-2xl' : 'sm:max-w-md'}`}
            initial={{ y: 40, opacity: 0.6 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 420, damping: 34 }}
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <h2 id={titleId} className="font-display text-xl font-semibold text-navy-900">
                {title}
              </h2>
              {dismissible && (
                <button
                  type="button"
                  onClick={onClose}
                  className="-mt-1 -mr-1 grid size-11 shrink-0 place-items-center rounded-full text-ink-soft hover:bg-cream-200"
                  aria-label="Tutup"
                >
                  <Icon name="close" />
                </button>
              )}
            </div>
            {children}
          </motion.div>
        </ExitSafe>
      )}
    </AnimatePresence>
  );
}

/**
 * While a sheet fades out it must not swallow taps or drags meant for the
 * game underneath (e.g. dragging a tile right after choosing a joker letter).
 */
function ExitSafe(props: HTMLMotionProps<'div'>) {
  const isPresent = useIsPresent();
  return <motion.div {...props} style={{ ...props.style, pointerEvents: isPresent ? undefined : 'none' }} aria-hidden={isPresent ? undefined : true} />;
}

export function ConfirmSheet({
  open,
  title,
  message,
  confirmLabel,
  tone = 'coral',
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel: string;
  tone?: 'coral' | 'navy' | 'jade';
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const toneCls = tone === 'coral' ? 'bg-coral-500 hover:bg-coral-600' : tone === 'jade' ? 'bg-jade-500 hover:bg-jade-600' : 'bg-navy-800 hover:bg-navy-700';
  return (
    <Sheet open={open} onClose={onCancel} title={title}>
      <div className="mb-5 text-ink-soft">{message}</div>
      <div className="flex gap-3">
        <button type="button" data-autofocus onClick={onCancel} className="btn-3d min-h-12 flex-1 rounded-xl border-2 border-cream-300 bg-white font-display font-semibold">
          Batal
        </button>
        <button type="button" onClick={onConfirm} className={`btn-3d min-h-12 flex-1 rounded-xl font-display font-semibold text-white ${toneCls}`}>
          {confirmLabel}
        </button>
      </div>
    </Sheet>
  );
}
