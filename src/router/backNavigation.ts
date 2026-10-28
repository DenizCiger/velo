/**
 * Back navigation for mobile (Android hardware/gesture Back).
 *
 * Two layers:
 *  1. An overlay stack: anything that is "on top" (drawer, bottom sheet, dialog,
 *     composer, multi-select mode, active search) registers a handler with
 *     `pushBackHandler()` / `useBackHandler()`. Back closes the topmost one.
 *  2. Route fallback (`resolveRouteBack`): thread → its list, any other list or
 *     page → inbox (or the last list for settings/help/...), inbox → leave app.
 */

type BackEntry = { id: number; onBack: () => void };

const stack: BackEntry[] = [];
let nextId = 1;

/** Register an overlay's close handler. Returns an unregister function. */
export function pushBackHandler(onBack: () => void): () => void {
  const entry: BackEntry = { id: nextId++, onBack };
  stack.push(entry);
  return () => {
    const idx = stack.findIndex((e) => e.id === entry.id);
    if (idx >= 0) stack.splice(idx, 1);
  };
}

/** Invoke the topmost overlay handler. Returns false if nothing was open. */
export function dispatchOverlayBack(): boolean {
  const top = stack[stack.length - 1];
  if (!top) return false;
  top.onBack();
  return true;
}

export function getBackStackDepth(): number {
  return stack.length;
}

/** Test helper. */
export function __resetBackStack(): void {
  stack.length = 0;
}

export type RouteBackAction = { kind: "navigate"; to: string } | { kind: "exit" };

const INBOX = "/mail/inbox";

/** Is this pathname a mail list (not a thread, not a page)? */
export function isMailListPath(pathname: string): boolean {
  return /^\/(mail|label|smart-folder)\/[^/]+\/?$/.test(pathname);
}

/**
 * Decide where Back goes when no overlay is open.
 * @param pathname   current route path, e.g. "/mail/inbox/thread/abc"
 * @param search     current search string including "?" (or "")
 * @param lastList   last visited mail list (path + search), used to return from settings/help/etc.
 */
export function resolveRouteBack(pathname: string, search: string, lastList: string | null): RouteBackAction {
  const thread = pathname.match(/^\/(mail|label|smart-folder)\/([^/]+)\/thread\/[^/]+/);
  if (thread) {
    return { kind: "navigate", to: `/${thread[1]}/${thread[2]}${search}` };
  }

  if (pathname === INBOX || pathname === `${INBOX}/` || pathname === "/" || pathname === "") {
    return { kind: "exit" };
  }

  if (isMailListPath(pathname)) {
    return { kind: "navigate", to: INBOX };
  }

  // Pages reached from the drawer (settings, help, tasks, calendar, attachments):
  // return to the list the user came from.
  if (lastList && lastList !== `${pathname}${search}`) {
    return { kind: "navigate", to: lastList };
  }
  return { kind: "navigate", to: INBOX };
}
