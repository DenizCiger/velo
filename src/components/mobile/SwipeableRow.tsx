import { useRef, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export interface SwipeAction {
  icon: LucideIcon;
  label: string;
  /** Tailwind background class for the revealed area */
  className: string;
  onTrigger: () => void;
}

interface SwipeableRowProps {
  children: ReactNode;
  /** Revealed when swiping to the right (finger moves right) */
  right?: SwipeAction;
  /** Revealed when swiping to the left */
  left?: SwipeAction;
}

/** Fraction of the row width that commits the action. */
export const SWIPE_COMMIT_RATIO = 0.35;

/**
 * Pure decision helper (exported for tests): does a gesture commit?
 * Commits past the distance threshold, or on a fast fling past 1/4 of it.
 */
export function shouldCommitSwipe(dx: number, width: number, velocityPxPerMs: number): boolean {
  const threshold = width * SWIPE_COMMIT_RATIO;
  if (Math.abs(dx) >= threshold) return true;
  return Math.abs(velocityPxPerMs) > 0.7 && Math.abs(dx) > threshold / 4 && Math.sign(velocityPxPerMs) === Math.sign(dx);
}

/**
 * List row with Gmail-style swipe actions. Vertical scrolling is left to the
 * browser (`touch-action: pan-y`); a gesture is claimed as a swipe only once it
 * is clearly horizontal. A completed swipe slides the row out, then fires.
 */
export function SwipeableRow({ children, right, left }: SwipeableRowProps) {
  const [dx, setDx] = useState(0);
  const [leaving, setLeaving] = useState<0 | 1 | -1>(0);
  const rowRef = useRef<HTMLDivElement>(null);
  const g = useRef<{ x: number; y: number; t: number; lastX: number; lastT: number; axis: "x" | "y" | null } | null>(null);
  const suppressClick = useRef(false);

  const onTouchStart = (e: React.TouchEvent) => {
    if (leaving) return;
    const t = e.touches[0]!;
    const now = performance.now();
    g.current = { x: t.clientX, y: t.clientY, t: now, lastX: t.clientX, lastT: now, axis: null };
    suppressClick.current = false;
  };

  const onTouchMove = (e: React.TouchEvent) => {
    const s = g.current;
    if (!s) return;
    const t = e.touches[0]!;
    const mx = t.clientX - s.x;
    const my = t.clientY - s.y;
    if (s.axis === null && (Math.abs(mx) > 10 || Math.abs(my) > 10)) {
      s.axis = Math.abs(mx) > Math.abs(my) * 1.2 ? "x" : "y";
    }
    if (s.axis !== "x") return;
    suppressClick.current = true;
    let next = mx;
    if (next > 0 && !right) next = 0;
    if (next < 0 && !left) next = 0;
    s.lastX = t.clientX;
    s.lastT = performance.now();
    setDx(next);
  };

  const end = () => {
    const s = g.current;
    g.current = null;
    if (!s || s.axis !== "x") {
      setDx(0);
      return;
    }
    const width = rowRef.current?.offsetWidth ?? 360;
    const velocity = (s.lastX - s.x) / Math.max(1, s.lastT - s.t);
    const action = dx > 0 ? right : left;
    if (action && dx !== 0 && shouldCommitSwipe(dx, width, velocity)) {
      const dir = dx > 0 ? 1 : -1;
      setLeaving(dir);
      setDx(dir * width);
      window.setTimeout(() => {
        action.onTrigger();
        // If the row is still mounted (e.g. snooze was cancelled), slide it back
        setLeaving(0);
        setDx(0);
      }, 200);
    } else {
      setDx(0);
    }
  };

  const active = dx > 0 ? right : dx < 0 ? left : null;
  const width = rowRef.current?.offsetWidth ?? 360;
  const armed = Math.abs(dx) >= width * SWIPE_COMMIT_RATIO;
  const Icon = active?.icon;

  return (
    <div ref={rowRef} className="relative overflow-hidden touch-pan-y select-none">
      {active && Icon && (
        <div
          className={`absolute inset-0 flex items-center ${dx > 0 ? "justify-start pl-6" : "justify-end pr-6"} ${active.className} text-white`}
          aria-hidden
        >
          <div className={`flex items-center gap-2 transition-transform duration-150 ${armed ? "scale-110" : "scale-90 opacity-80"}`}>
            <Icon size={22} />
            <span className="text-sm font-medium">{active.label}</span>
          </div>
        </div>
      )}
      <div
        className="relative bg-surface motion-transform"
        style={{
          transform: dx ? `translateX(${dx}px)` : undefined,
          transition: g.current ? "none" : "transform 200ms var(--ease-out-soft)",
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={end}
        onTouchCancel={end}
        onClickCapture={(e) => {
          if (suppressClick.current) {
            e.preventDefault();
            e.stopPropagation();
            suppressClick.current = false;
          }
        }}
        onContextMenuCapture={(e) => {
          // A long-press that turned into a swipe must not open selection mode
          if (suppressClick.current) {
            e.preventDefault();
            e.stopPropagation();
          }
        }}
      >
        {children}
      </div>
    </div>
  );
}
