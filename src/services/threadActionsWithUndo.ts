import { useThreadStore, type Thread } from "@/stores/threadStore";
import { useUndoStore } from "@/stores/undoStore";
import { archiveThread, trashThread } from "./emailActions";
import { snoozeThread } from "./snooze/snoozeManager";

/**
 * Phone-layout thread actions with a 5s Undo window. The row is removed from
 * the list immediately; the real action runs when the snackbar expires (see
 * undoStore). Undo puts the row back where it was.
 */
function removeWithUndo(thread: Thread, message: string, commit: () => unknown): void {
  const store = useThreadStore.getState();
  const index = store.threads.findIndex((t) => t.id === thread.id);
  store.removeThread(thread.id);
  useUndoStore.getState().show({
    message,
    commit,
    revert: () => {
      const { threads, setThreads } = useThreadStore.getState();
      if (threads.some((t) => t.id === thread.id)) return;
      const next = [...threads];
      next.splice(index < 0 ? 0 : Math.min(index, next.length), 0, thread);
      setThreads(next);
    },
  });
}

export function archiveThreadWithUndo(accountId: string, thread: Thread): void {
  removeWithUndo(thread, "Conversation archived", () => archiveThread(accountId, thread.id, []));
}

export function trashThreadWithUndo(accountId: string, thread: Thread): void {
  removeWithUndo(thread, "Moved to Trash", () => trashThread(accountId, thread.id, []));
}

export function snoozeThreadWithUndo(accountId: string, thread: Thread, until: number): void {
  const when = new Date(until).toLocaleString(undefined, {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
  removeWithUndo(thread, `Snoozed until ${when}`, () => snoozeThread(accountId, thread.id, until));
}
