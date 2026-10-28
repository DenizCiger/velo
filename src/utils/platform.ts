/**
 * Platform detection — the single source of truth for "are we on a phone?".
 *
 * Two separate questions live here:
 *  - **Platform** (what OS are we running on): decides which native APIs exist
 *    (window controls, tray, global shortcuts, updater, autostart, popout windows
 *    are desktop-only). Fixed for the lifetime of the process.
 *  - **Layout** (how much room do we have): decides single-pane vs. multi-pane.
 *    Changes with rotation / window resizing; see `COMPACT_LAYOUT_QUERY` and
 *    `useIsCompact()` in `src/hooks/useLayoutMode.ts`.
 */
import { platform as osPlatform } from "@tauri-apps/plugin-os";

export type PlatformName = "android" | "ios" | "linux" | "macos" | "windows" | "web";

const KNOWN: ReadonlySet<string> = new Set(["android", "ios", "linux", "macos", "windows"]);

/**
 * Pure detection logic (exported for tests).
 * Prefers the Tauri OS plugin's answer; falls back to the user agent when the
 * plugin is unavailable (vitest/jsdom, plain `vite dev` in a browser).
 */
export function detectPlatform(
  readOsPlugin: () => string | undefined,
  userAgent: string,
): PlatformName {
  try {
    const p = readOsPlugin();
    if (p && KNOWN.has(p)) return p as PlatformName;
  } catch {
    // plugin internals not injected — fall through to UA sniffing
  }
  if (/Android/i.test(userAgent)) return "android";
  if (/iPhone|iPad|iPod/i.test(userAgent)) return "ios";
  return "web";
}

let cached: PlatformName | null = null;

export function getPlatform(): PlatformName {
  if (cached === null) {
    cached = detectPlatform(
      () => osPlatform(),
      typeof navigator !== "undefined" ? navigator.userAgent : "",
    );
  }
  return cached;
}

/** Android or iOS — no window chrome, tray, global shortcuts, updater or popouts. */
export function isMobilePlatform(): boolean {
  const p = getPlatform();
  return p === "android" || p === "ios";
}

/** A Tauri desktop build (Linux, macOS, Windows). `web` counts as neither. */
export function isDesktopPlatform(): boolean {
  const p = getPlatform();
  return p === "linux" || p === "macos" || p === "windows";
}

/** Test hook: override or reset the cached platform. */
export function __setPlatformForTests(p: PlatformName | null): void {
  cached = p;
}

/**
 * Media query for the single-pane phone layout. Below this the app shows one
 * screen at a time (list → thread) with a drawer instead of a sidebar.
 *  - narrower than 768px (phones in portrait, small split-screen windows), or
 *  - a short touch screen (phones in landscape).
 * Desktop windows have an 800px minimum width and a fine pointer, so the desktop
 * layout never matches this query.
 */
export const COMPACT_LAYOUT_QUERY =
  "(max-width: 767px), (max-height: 500px) and (pointer: coarse)";

/** Adds `platform-<name>` and `platform-mobile|desktop` classes to <html>. */
export function applyPlatformClasses(root: HTMLElement = document.documentElement): void {
  const p = getPlatform();
  root.classList.add(`platform-${p}`);
  if (isMobilePlatform()) root.classList.add("platform-mobile");
  else if (isDesktopPlatform()) root.classList.add("platform-desktop");
}
