import { useSyncExternalStore } from "react";
import { COMPACT_LAYOUT_QUERY } from "@/utils/platform";

function getMql(): MediaQueryList | null {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return null;
  return window.matchMedia(COMPACT_LAYOUT_QUERY);
}

function subscribe(onChange: () => void): () => void {
  const mql = getMql();
  if (!mql) return () => {};
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

/** Non-React read of the current layout mode. */
export function isCompactLayout(): boolean {
  return getMql()?.matches ?? false;
}

/**
 * True when the app should use the single-pane phone layout
 * (see `COMPACT_LAYOUT_QUERY`). Re-renders on rotation / resize.
 */
export function useIsCompact(): boolean {
  return useSyncExternalStore(subscribe, isCompactLayout, () => false);
}
