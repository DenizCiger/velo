/**
 * Thin wrapper around the `window.VeloAndroid` JavascriptInterface injected by
 * `src-tauri/gen/android/app/src/main/java/com/velomail/app/MainActivity.kt`.
 * Every function is a safe no-op when the bridge is absent (desktop, tests).
 */

interface VeloAndroidBridge {
  getInsets(): string;
  moveTaskToBack(): void;
  setSystemBarsDark(dark: boolean): void;
}

export interface NativeInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
  /** Height of the on-screen keyboard (includes the nav bar area), 0 when hidden. */
  ime: number;
}

function getBridge(): VeloAndroidBridge | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { VeloAndroid?: VeloAndroidBridge }).VeloAndroid ?? null;
}

export function hasAndroidBridge(): boolean {
  return getBridge() !== null;
}

/** Send the app to the background (Android root Back behaviour). Returns false without a bridge. */
export function moveAppToBackground(): boolean {
  const b = getBridge();
  if (!b) return false;
  b.moveTaskToBack();
  return true;
}

export function setSystemBarsDark(dark: boolean): void {
  getBridge()?.setSystemBarsDark(dark);
}

export function parseInsets(raw: unknown): NativeInsets | null {
  let v = raw;
  if (typeof v === "string") {
    try {
      v = JSON.parse(v);
    } catch {
      return null;
    }
  }
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const num = (k: string) => (typeof o[k] === "number" && Number.isFinite(o[k]) ? (o[k] as number) : 0);
  return { top: num("top"), right: num("right"), bottom: num("bottom"), left: num("left"), ime: num("ime") };
}

/**
 * Mirror native insets into CSS custom properties on <html>:
 *   --native-inset-{top,right,bottom,left}  system bars + display cutout
 *   --keyboard-inset                        extra space covered by the IME
 * globals.css combines these with env(safe-area-inset-*).
 */
export function applyInsets(insets: NativeInsets, root: HTMLElement = document.documentElement): void {
  root.style.setProperty("--native-inset-top", `${insets.top}px`);
  root.style.setProperty("--native-inset-right", `${insets.right}px`);
  root.style.setProperty("--native-inset-bottom", `${insets.bottom}px`);
  root.style.setProperty("--native-inset-left", `${insets.left}px`);
  root.style.setProperty("--keyboard-inset", `${Math.max(0, insets.ime - insets.bottom)}px`);
  root.classList.toggle("keyboard-open", insets.ime > insets.bottom);
}

/** Start mirroring native insets. Returns a cleanup function. */
export function initNativeInsets(): () => void {
  const b = getBridge();
  if (!b) return () => {};
  const initial = parseInsets(b.getInsets());
  if (initial) applyInsets(initial);
  const handler = (e: Event) => {
    const parsed = parseInsets((e as CustomEvent).detail);
    if (parsed) applyInsets(parsed);
  };
  window.addEventListener("velo-native-insets", handler);
  return () => window.removeEventListener("velo-native-insets", handler);
}
