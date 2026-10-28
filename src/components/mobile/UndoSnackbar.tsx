import { useEffect } from "react";
import { useUndoStore } from "@/stores/undoStore";

/**
 * Material-style snackbar for deferred undoable actions (phone layout).
 * Sits above the compose button and the gesture bar.
 */
export function UndoSnackbar() {
  const current = useUndoStore((s) => s.current);
  const undo = useUndoStore((s) => s.undo);

  // Don't lose a pending action if the app goes to the background
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") useUndoStore.getState().flush();
    };
    // A sync reloads the list from the DB; commit first so the row doesn't reappear
    const onSync = () => useUndoStore.getState().flush();
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("velo-sync-done", onSync);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("velo-sync-done", onSync);
    };
  }, []);

  if (!current) return null;

  return (
    <div
      key={current.id}
      role="status"
      aria-live="polite"
      className="fixed z-[80] left-3 right-3 bottom-[calc(var(--safe-bottom)+5.25rem)] flex items-center gap-2 rounded-2xl bg-[#1e1b2e] dark:bg-[#e2e8f0] text-white dark:text-[#0f172a] shadow-2xl pl-4 pr-1.5 min-h-12 animate-[slideUp_220ms_var(--ease-emphasized),fadeIn_180ms_ease-out]"
    >
      <span className="flex-1 text-sm truncate py-3">{current.message}</span>
      <button
        onClick={undo}
        className="shrink-0 min-h-11 px-4 rounded-xl text-sm font-semibold text-[#a5b4fc] dark:text-[#4f46e5] active:bg-white/10 dark:active:bg-black/5"
      >
        Undo
      </button>
    </div>
  );
}
