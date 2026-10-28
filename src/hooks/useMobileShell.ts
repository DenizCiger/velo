import { useEffect } from "react";
import { router } from "@/router";
import { getPlatform } from "@/utils/platform";
import { dispatchOverlayBack, isMailListPath, resolveRouteBack } from "@/router/backNavigation";
import { initNativeInsets, moveAppToBackground, setSystemBarsDark } from "@/utils/androidBridge";

/**
 * Android-only shell integration:
 *  - hardware/gesture Back navigates inside the app (overlay → thread → list →
 *    inbox → background) instead of closing the activity,
 *  - native system-bar / keyboard insets are mirrored into CSS variables,
 *  - status/navigation bar icon colour follows the app's light/dark theme.
 */
export function useMobileShell(): void {
  useEffect(() => {
    if (getPlatform() !== "android") return;

    const cleanups: Array<() => void> = [];
    let disposed = false;

    // Remember the last mail list so Back from Settings/Help returns there.
    let lastList: string | null = null;
    const rememberList = () => {
      const { pathname, searchStr } = router.state.location;
      if (isMailListPath(pathname)) lastList = `${pathname}${searchStr}`;
    };
    rememberList();
    cleanups.push(router.subscribe("onResolved", rememberList));

    import("@tauri-apps/api/app")
      .then(({ onBackButtonPress }) =>
        onBackButtonPress(() => {
          if (dispatchOverlayBack()) return;
          const { pathname, searchStr } = router.state.location;
          const action = resolveRouteBack(pathname, searchStr, lastList);
          if (action.kind === "exit") {
            moveAppToBackground();
          } else {
            router.history.push(action.to);
          }
        }),
      )
      .then((listener) => {
        if (disposed) listener.unregister().catch(() => {});
        else cleanups.push(() => { listener.unregister().catch(() => {}); });
      })
      .catch((err) => console.warn("Back button handler unavailable:", err));

    cleanups.push(initNativeInsets());

    // The Android WebView doesn't resize for the keyboard; once it opens, bring
    // the focused field into the (now shorter) visible area.
    let wasOpen = false;
    const onInsets = (e: Event) => {
      const ime = (e as CustomEvent<{ ime?: number; bottom?: number }>).detail;
      const open = (ime?.ime ?? 0) > (ime?.bottom ?? 0);
      if (open && !wasOpen) {
        requestAnimationFrame(() => {
          const el = document.activeElement as HTMLElement | null;
          if (el && el !== document.body && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) {
            el.scrollIntoView({ block: "center", behavior: "smooth" });
          }
        });
      }
      wasOpen = open;
    };
    window.addEventListener("velo-native-insets", onInsets);
    cleanups.push(() => window.removeEventListener("velo-native-insets", onInsets));

    const root = document.documentElement;
    const syncBars = () => setSystemBarsDark(root.classList.contains("dark"));
    syncBars();
    const observer = new MutationObserver(syncBars);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    cleanups.push(() => observer.disconnect());

    return () => {
      disposed = true;
      for (const fn of cleanups) fn();
    };
  }, []);
}
