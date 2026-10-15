import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
export function Modal({
  title,
  children,
  onClose,
  className = '',
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  className?: string;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null),
    close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const el = ref.current;
    (
      el?.querySelector<HTMLElement>('[data-autofocus]') ??
      el?.querySelector<HTMLElement>('input:not([type=checkbox]), button') ??
      el
    )?.focus();
    return () => {
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  return createPortal(
    <div
      className={`modal-backdrop ${className}`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        className={`modal ${wide ? 'wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            close.current();
          }
          if (e.key === 'Tab') {
            const items = [
              ...(ref.current?.querySelectorAll<HTMLElement>(
                'button:not(:disabled), a[href], input:not(:disabled), select, textarea, [tabindex="0"]',
              ) ?? []),
            ].filter((el) => el.getClientRects().length);
            const first = items[0],
              last = items.at(-1);
            if (e.shiftKey && document.activeElement === first) {
              e.preventDefault();
              last?.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault();
              first?.focus();
            }
          }
        }}
      >
        <div className="modal-heading">
          <h2>{title}</h2>
          <button
            className="icon-button"
            aria-label={`Close ${title}`}
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
