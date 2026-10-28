import { create } from "zustand";

/**
 * Deferred, undoable actions (used by swipe-to-archive/snooze on phones).
 *
 * The UI applies the change optimistically (e.g. removes the row) and calls
 * `show()`. The real action (`commit`) only runs when the snackbar times out,
 * is replaced by another action, or is flushed (e.g. app backgrounded).
 * `undo()` reverts the optimistic UI and the action never runs.
 */
export interface UndoEntry {
  message: string;
  commit: () => unknown;
  revert: () => void;
}

interface UndoState {
  current: (UndoEntry & { id: number }) | null;
  show: (entry: UndoEntry, timeoutMs?: number) => void;
  undo: () => void;
  flush: () => void;
}

export const UNDO_TIMEOUT_MS = 5000;

let timer: ReturnType<typeof setTimeout> | null = null;
let nextId = 1;

function clearTimer() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
}

function runCommit(entry: UndoEntry) {
  try {
    const result = entry.commit();
    if (result && typeof (result as Promise<unknown>).catch === "function") {
      (result as Promise<unknown>).catch((err) => console.error("Undoable action failed:", err));
    }
  } catch (err) {
    console.error("Undoable action failed:", err);
  }
}

export const useUndoStore = create<UndoState>((set, get) => ({
  current: null,

  show: (entry, timeoutMs = UNDO_TIMEOUT_MS) => {
    // Commit whatever was pending before showing the new one
    get().flush();
    const id = nextId++;
    set({ current: { ...entry, id } });
    timer = setTimeout(() => {
      const cur = get().current;
      if (cur?.id === id) {
        timer = null;
        set({ current: null });
        runCommit(cur);
      }
    }, timeoutMs);
  },

  undo: () => {
    const cur = get().current;
    clearTimer();
    if (!cur) return;
    set({ current: null });
    cur.revert();
  },

  flush: () => {
    const cur = get().current;
    clearTimer();
    if (!cur) return;
    set({ current: null });
    runCommit(cur);
  },
}));
