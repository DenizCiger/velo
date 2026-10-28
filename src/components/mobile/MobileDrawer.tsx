import { useEffect, useRef, useState, type ReactNode } from "react";
import { useUIStore } from "@/stores/uiStore";
import { useBackHandler } from "@/hooks/useBackHandler";

/**
 * Modal navigation drawer for the phone layout. Opened from the hamburger in
 * the app bar; closed by tapping the scrim, swiping the panel left, Back, or
 * navigating (App closes it on route change).
 *
 * No edge-swipe-to-open: Android's gesture navigation owns both screen edges
 * for Back, so an edge swipe would fight the system (same choice as Gmail).
 */
export function MobileDrawer({ children }: { children: ReactNode }) {
  const open = useUIStore((s) => s.mobileDrawerOpen);
  const setOpen = useUIStore((s) => s.setMobileDrawerOpen);
  const [dragX, setDragX] = useState(0);
  const start = useRef<{ x: number; y: number; t: number; locked: boolean | null } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Mount closed, then flip to open on the next frame so the slide animates;
  // keep the panel mounted while it animates out.
  const [rendered, setRendered] = useState(open);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!open) {
      setShown(false);
      return;
    }
    setRendered(true);
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setShown(true));
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [open]);

  useBackHandler(open, () => setOpen(false));

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0]!;
    start.current = { x: t.clientX, y: t.clientY, t: performance.now(), locked: null };
  };
  const onTouchMove = (e: React.TouchEvent) => {
    const s = start.current;
    if (!s) return;
    const t = e.touches[0]!;
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    // Decide once whether this gesture is a horizontal drag or a vertical scroll
    if (s.locked === null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
      s.locked = Math.abs(dx) > Math.abs(dy);
    }
    if (s.locked) setDragX(Math.min(0, dx));
  };
  const onTouchEnd = () => {
    const s = start.current;
    start.current = null;
    if (!s?.locked) return;
    const width = panelRef.current?.offsetWidth ?? 300;
    const velocity = -dragX / Math.max(1, performance.now() - s.t);
    if (-dragX > width * 0.33 || velocity > 0.5) setOpen(false);
    setDragX(0);
  };

  if (!rendered) return null;

  const dragging = dragX !== 0;
  return (
    <div className={`fixed inset-0 z-[70] ${open ? "" : "pointer-events-none"}`} aria-hidden={!open}>
      <div
        className={`absolute inset-0 bg-black/40 transition-opacity duration-300 motion-transform ${shown ? "opacity-100" : "opacity-0"}`}
        onClick={() => setOpen(false)}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTransitionEnd={() => {
          if (!shown) setRendered(false);
        }}
        className="absolute top-0 bottom-0 left-0 w-[min(85vw,320px)] flex flex-col rounded-r-3xl overflow-hidden shadow-2xl motion-transform"
        style={{
          transform: shown ? `translateX(${dragX}px)` : "translateX(-105%)",
          transition: dragging ? "none" : "transform 300ms var(--ease-emphasized)",
        }}
      >
        {children}
      </div>
    </div>
  );
}
