import { useEffect, useRef, useState, type RefObject } from "react";

/** Distance (px) the user must pull before release triggers a refresh. */
export const PULL_TRIGGER = 72;
const PULL_MAX = 112;

/** Rubber-band mapping from finger travel to indicator offset (exported for tests). */
export function pullDistance(fingerDy: number): number {
  if (fingerDy <= 0) return 0;
  // Linear-ish at first, then increasingly resistant, capped at PULL_MAX
  return Math.min(PULL_MAX, PULL_MAX * (1 - Math.exp(-fingerDy / 160)));
}

/**
 * Pull-to-refresh on a scroll container. Only engages when the list is
 * scrolled to the top and the finger moves down; otherwise normal scrolling.
 */
export function usePullToRefresh(
  scrollRef: RefObject<HTMLElement | null>,
  onRefresh: () => Promise<unknown>,
  enabled: boolean,
): { pull: number; refreshing: boolean } {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const state = useRef<{ startY: number; startX: number; active: boolean } | null>(null);
  const pullRef = useRef(0);
  const refreshRef = useRef(onRefresh);
  refreshRef.current = onRefresh;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !enabled) return;

    const onStart = (e: TouchEvent) => {
      if (el.scrollTop > 0) {
        state.current = null;
        return;
      }
      const t = e.touches[0]!;
      state.current = { startY: t.clientY, startX: t.clientX, active: false };
    };
    const onMove = (e: TouchEvent) => {
      const s = state.current;
      if (!s) return;
      const t = e.touches[0]!;
      const dy = t.clientY - s.startY;
      const dx = t.clientX - s.startX;
      if (!s.active) {
        // Claim only clearly-downward gestures that start at the top
        if (dy > 8 && dy > Math.abs(dx) && el.scrollTop <= 0) s.active = true;
        else if (dy < -4 || Math.abs(dx) > 12) {
          state.current = null;
          return;
        } else return;
      }
      if (e.cancelable) e.preventDefault();
      pullRef.current = pullDistance(dy - 8);
      setPull(pullRef.current);
    };
    const onEnd = () => {
      const s = state.current;
      state.current = null;
      if (!s?.active) return;
      const distance = pullRef.current;
      pullRef.current = 0;
      if (distance >= PULL_TRIGGER) {
        setRefreshing(true);
        setPull(PULL_TRIGGER * 0.75);
        Promise.resolve()
          .then(() => refreshRef.current())
          .catch(() => {})
          .finally(() => {
            setRefreshing(false);
            setPull(0);
          });
      } else {
        setPull(0);
      }
    };

    el.addEventListener("touchstart", onStart, { passive: true });
    // Non-passive so we can stop the browser's overscroll while pulling
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onEnd);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, [scrollRef, enabled]);

  return { pull, refreshing };
}
