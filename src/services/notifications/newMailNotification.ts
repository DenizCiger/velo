/**
 * Pure builders for new-mail notifications (no I/O, unit-tested).
 */
import type { Options } from "@tauri-apps/plugin-notification";
import type { AndroidMailNotification } from "../backgroundSync/nativeBgSync";

/** Fixed id so each burst summary replaces the previous one instead of stacking. */
export const SUMMARY_NOTIFICATION_ID = 0x7e00;
const MAX_INBOX_LINES = 6;

export interface PendingMail {
  from: string;
  subject: string;
  threadId?: string;
  accountId?: string;
}

/** Stable positive 31-bit id per thread, so a newer message in the same thread replaces its notification. */
export function threadNotificationId(threadId: string): number {
  let h = 0;
  for (let i = 0; i < threadId.length; i++) {
    h = (Math.imul(h, 31) + threadId.charCodeAt(i)) | 0;
  }
  const id = h & 0x7fffffff;
  // Keep clear of the summary id and the bg-sync service's own ids (0x7e00-0x7eff)
  return id >= 0x7e00 && id <= 0x7eff ? id + 0x100 : id;
}

function subjectOf(m: PendingMail): string {
  return m.subject || "(No subject)";
}

/** Desktop: the original single / "N new emails" toasts. */
export function buildDesktopMailNotification(batch: PendingMail[]): Options | null {
  const first = batch[0];
  if (!first) return null;
  if (batch.length === 1) {
    return { title: first.from, body: subjectOf(first), actionTypeId: "email" };
  }
  return { title: "Velo", body: `${batch.length} new emails`, actionTypeId: "email" };
}

/**
 * Android: one notification per thread (a newer message replaces it), or one
 * inbox-style summary for a burst. Carries the thread/account so a tap opens
 * the conversation; a burst spanning several threads opens the inbox.
 */
export function buildAndroidMailNotification(batch: PendingMail[]): AndroidMailNotification | null {
  const first = batch[0];
  if (!first) return null;

  const threadIds = new Set(batch.map((m) => m.threadId).filter(Boolean));
  const accountIds = new Set(batch.map((m) => m.accountId).filter(Boolean));
  const target: Pick<AndroidMailNotification, "threadId" | "accountId"> = {};
  if (threadIds.size === 1 && first.threadId) target.threadId = first.threadId;
  if (accountIds.size === 1 && first.accountId) target.accountId = first.accountId;

  if (batch.length === 1) {
    return {
      id: first.threadId ? threadNotificationId(first.threadId) : SUMMARY_NOTIFICATION_ID,
      title: first.from,
      body: subjectOf(first),
      ...target,
    };
  }

  const lines = batch.slice(0, MAX_INBOX_LINES).map((m) => `${m.from}  ${subjectOf(m)}`);
  const more = batch.length - lines.length;
  return {
    id: SUMMARY_NOTIFICATION_ID,
    title: `${batch.length} new emails`,
    body: [...new Set(batch.map((m) => m.from))].join(", "),
    lines,
    ...(more > 0 ? { summary: `+${more} more` } : {}),
    ...target,
  };
}
