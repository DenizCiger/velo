/**
 * Pure builders for new-mail notifications (no I/O, unit-tested).
 */
import type { Options } from "@tauri-apps/plugin-notification";

export const NEW_MAIL_CHANNEL_ID = "new_mail";
const ANDROID_GROUP = "velo-new-mail";
/** Status-bar icon shipped by the bg-sync plugin (res/drawable/ic_stat_velo_sync.xml). */
const ANDROID_ICON = "ic_stat_velo_sync";
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

/**
 * One notification for a debounced batch of new messages. Desktop keeps the
 * original single/"N new emails" toasts; Android gets its own channel, a
 * monochrome icon, per-thread ids, an inbox-style summary for bursts, and the
 * thread/account in `extra` so a tap can open the right conversation.
 */
export function buildNewMailNotification(batch: PendingMail[], android: boolean): Options | null {
  if (batch.length === 0) return null;
  const first = batch[0]!;

  if (!android) {
    if (batch.length === 1) {
      return { title: first.from, body: subjectOf(first), actionTypeId: "email" };
    }
    return { title: "Velo", body: `${batch.length} new emails`, actionTypeId: "email" };
  }

  const threadIds = new Set(batch.map((m) => m.threadId).filter(Boolean));
  const accountIds = new Set(batch.map((m) => m.accountId).filter(Boolean));
  const extra: Record<string, string> = {};
  if (threadIds.size === 1 && first.threadId) extra["threadId"] = first.threadId;
  if (accountIds.size === 1 && first.accountId) extra["accountId"] = first.accountId;

  const common = {
    channelId: NEW_MAIL_CHANNEL_ID,
    group: ANDROID_GROUP,
    icon: ANDROID_ICON,
    autoCancel: true,
    extra,
  };

  if (batch.length === 1) {
    return {
      ...common,
      id: first.threadId ? threadNotificationId(first.threadId) : SUMMARY_NOTIFICATION_ID,
      title: first.from,
      body: subjectOf(first),
      largeBody: subjectOf(first),
    };
  }

  const lines = batch.slice(0, MAX_INBOX_LINES).map((m) => `${m.from}  ${subjectOf(m)}`);
  const more = batch.length - lines.length;
  return {
    ...common,
    id: SUMMARY_NOTIFICATION_ID,
    title: `${batch.length} new emails`,
    body: [...new Set(batch.map((m) => m.from))].join(", "),
    inboxLines: lines,
    summary: more > 0 ? `+${more} more` : undefined,
  };
}

export interface NotificationContextLike {
  threadId?: string;
  accountId?: string;
  fromAddress?: string;
  subject?: string;
}

export interface NotificationTarget {
  actionId: string | undefined;
  context: NotificationContextLike | null;
  /** A tap on a multi-thread summary: show the inbox. */
  openInbox: boolean;
}

/**
 * Work out what a notification action refers to. Android passes
 * `{ actionId, notification: { extra } }` with the thread inside the
 * notification; other platforms only give the action, so fall back to the
 * last notification shown.
 */
export function resolveNotificationTarget(
  event: unknown,
  fallback: NotificationContextLike | null,
): NotificationTarget {
  const e = (event ?? {}) as {
    actionId?: unknown;
    actionTypeId?: unknown;
    notification?: { extra?: Record<string, unknown> | null } | null;
  };
  const str = (v: unknown) => (typeof v === "string" && v.length > 0 ? v : undefined);
  const extra = e.notification?.extra;
  if (extra && typeof extra === "object") {
    const threadId = str(extra["threadId"]);
    const accountId = str(extra["accountId"]);
    return {
      actionId: str(e.actionId),
      context: threadId || accountId ? { threadId, accountId } : null,
      openInbox: !threadId,
    };
  }
  return {
    actionId: str(e.actionTypeId) ?? str(e.actionId),
    context: fallback,
    openInbox: false,
  };
}
