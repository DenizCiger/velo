import { useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useBackHandler } from "@/hooks/useBackHandler";

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  /** Optional heading shown under the drag handle */
  title?: ReactNode;
  children: ReactNode;
  /** Accessible label when no visible title is given */
  ariaLabel?: string;
}

/**
 * Phone bottom sheet: scrim + panel anchored to the bottom edge, drag the
 * handle/header down (or tap the scrim, or press Back) to dismiss.
 */
export function BottomSheet({ open, onClose, title, children, ariaLabel }: BottomSheetProps) {
  const [dragY, setDragY] = useState(0);
  const startRef = useRef<{ y: number; t: number } | null>(null);

  useBackHandler(open, onClose);

  if (!open) return null;

  const onTouchStart = (e: React.TouchEvent) => {
    startRef.current = { y: e.touches[0]!.clientY, t: performance.now() };
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (!startRef.current) return;
    setDragY(Math.max(0, e.touches[0]!.clientY - startRef.current.y));
  };
  const onTouchEnd = () => {
    const start = startRef.current;
    startRef.current = null;
    if (!start) return;
    const velocity = dragY / Math.max(1, performance.now() - start.t);
    if (dragY > 96 || velocity > 0.6) onClose();
    setDragY(0);
  };

  return createPortal(
    <div className="fixed inset-0 z-[90] flex flex-col justify-end" role="dialog" aria-modal="true" aria-label={ariaLabel}>
      <div className="absolute inset-0 bg-black/40 sheet-scrim" onClick={onClose} />
      <div
        className="relative sheet-panel bg-bg-primary glass-modal rounded-t-3xl border-t border-border-primary max-h-[85dvh] flex flex-col pb-[var(--safe-bottom)] pl-[var(--safe-left)] pr-[var(--safe-right)]"
        style={dragY ? { transform: `translateY(${dragY}px)`, transition: "none" } : { transition: "transform 200ms var(--ease-out-soft)" }}
      >
        <div
          className="shrink-0 pt-2.5 pb-1 touch-none"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          <div className="mx-auto h-1 w-9 rounded-full bg-text-tertiary/40" />
          {title && <div className="px-5 pt-3 pb-1 text-[0.9375rem] font-semibold text-text-primary truncate">{title}</div>}
        </div>
        <div className="overflow-y-auto overscroll-contain pb-2">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
