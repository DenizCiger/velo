import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
  registerActionTypes,
  onAction,
  createChannel,
  Importance,
  Visibility,
} from "@tauri-apps/plugin-notification";
import { getSetting } from "../db/settings";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { getPlatform, isMobilePlatform } from "@/utils/platform";
import { useComposerStore } from "../../stores/composerStore";
import { useAccountStore } from "../../stores/accountStore";
import { navigateToLabel } from "../../router/navigate";
import { normalizeEmail } from "@/utils/emailUtils";
import {
  buildNewMailNotification,
  resolveNotificationTarget,
  NEW_MAIL_CHANNEL_ID,
  type PendingMail,
} from "./newMailNotification";

let initialized = false;
let handlersRegistered = false;
let channelCreated = false;
let notificationsEnabled = true;

interface NotificationContext {
  threadId?: string;
  accountId?: string;
  fromAddress?: string;
  subject?: string;
}

let lastNotificationContext: NotificationContext | null = null;
const recentContexts = new Map<string, NotificationContext>();

async function showAndFocusMainWindow(): Promise<void> {
  // Mobile has a single always-visible window
  if (isMobilePlatform()) return;
  try {
    const mainWindow = await WebviewWindow.getByLabel("main");
    if (mainWindow) {
      await mainWindow.show();
      await mainWindow.setFocus();
    }
  } catch (err) {
    console.warn("Failed to focus main window:", err);
  }
}

/**
 * Initialize notification permissions and action types.
 */
export async function initNotifications(): Promise<void> {
  if (initialized) return;
  initialized = true;

  const setting = await getSetting("notifications_enabled");
  notificationsEnabled = setting !== "false";

  if (!notificationsEnabled) return;

  let granted = await isPermissionGranted();
  if (!granted) {
    const permission = await requestPermission();
    granted = permission === "granted";
  }

  if (!granted) {
    notificationsEnabled = false;
    return;
  }

  await registerHandlers();
}

/**
 * Re-check the OS permission without prompting (e.g. after the user granted it
 * from Settings) and enable notifications if it is now granted.
 */
export async function refreshNotificationPermission(): Promise<boolean> {
  const setting = await getSetting("notifications_enabled");
  if (setting === "false") {
    notificationsEnabled = false;
    return false;
  }
  const granted = await isPermissionGranted();
  notificationsEnabled = granted;
  if (granted) await registerHandlers();
  return granted;
}

async function ensureAndroidChannel(): Promise<void> {
  if (channelCreated || getPlatform() !== "android") return;
  try {
    await createChannel({
      id: NEW_MAIL_CHANNEL_ID,
      name: "New mail",
      description: "A notification for each new email in your inbox",
      importance: Importance.High,
      visibility: Visibility.Private,
      vibration: true,
      lights: true,
    });
    channelCreated = true;
  } catch (err) {
    console.warn("Failed to create notification channel:", err);
  }
}

async function openThreadFromNotification(threadId: string, accountId?: string): Promise<void> {
  const accounts = useAccountStore.getState();
  if (accountId && accounts.activeAccountId !== accountId && accounts.accounts.some((a) => a.id === accountId)) {
    accounts.setActiveAccount(accountId);
  }
  navigateToLabel("inbox", { threadId });
}

async function registerHandlers(): Promise<void> {
  if (handlersRegistered) return;
  handlersRegistered = true;

  await ensureAndroidChannel();

  // Register action types and handlers (not available on all platforms)
  try {
    await registerActionTypes([
      {
        id: "default",
        actions: [],
      },
      {
        id: "email",
        actions: [
          { id: "reply", title: "Reply" },
          { id: "archive", title: "Archive" },
        ],
      },
    ]);

    await onAction(async (event) => {
      // Android delivers a tap as { actionId: "tap", notification: { extra } }
      // and carries the thread in the notification itself.
      const target = resolveNotificationTarget(event as unknown, lastNotificationContext);
      const actionId = target.actionId;
      const ctx = target.context;

      if (actionId === "reply" && ctx?.threadId && ctx?.accountId) {
        await showAndFocusMainWindow();
        useComposerStore.getState().openComposer({
          mode: "reply",
          to: ctx.fromAddress ? [ctx.fromAddress] : [],
          subject: ctx.subject ? `Re: ${ctx.subject}` : "",
          threadId: ctx.threadId,
        });
      } else if (actionId === "archive" && ctx?.threadId && ctx?.accountId) {
        try {
          const { archiveThread } = await import("../emailActions");
          await archiveThread(ctx.accountId, ctx.threadId, []);
        } catch (err) {
          console.error("Failed to archive from notification:", err);
        }
      } else {
        await showAndFocusMainWindow();
        if (ctx?.threadId) {
          await openThreadFromNotification(ctx.threadId, ctx.accountId);
        } else if (target.openInbox) {
          navigateToLabel("inbox");
        }
      }
    });
  } catch {
    // registerActionTypes/onAction not available on this platform (e.g. Windows)
  }
}

/**
 * Show a notification for new emails.
 * Batches notifications to avoid spam during sync.
 */
let pending: PendingMail[] = [];
let notifyTimer: ReturnType<typeof setTimeout> | null = null;

export function queueNewEmailNotification(
  from: string,
  subject: string,
  threadId?: string,
  accountId?: string,
  fromAddress?: string,
): void {
  if (!notificationsEnabled) return;

  pending.push({ from, subject, threadId, accountId });

  // Store context for action handling
  const ctx = { threadId, accountId, fromAddress, subject };
  lastNotificationContext = ctx;
  if (threadId) recentContexts.set(threadId, ctx);

  // Debounce: wait 2s before showing, to batch during sync
  if (notifyTimer) clearTimeout(notifyTimer);
  notifyTimer = setTimeout(() => {
    const batch = pending;
    pending = [];
    notifyTimer = null;
    const options = buildNewMailNotification(batch, getPlatform() === "android");
    if (options) sendNotification(options);
  }, 2000);
}

/**
 * Determine if a new email should trigger a notification based on smart notification settings.
 * Pure function — no I/O, all config is passed in from the sync cycle.
 */
export function shouldNotifyForMessage(
  smartEnabled: boolean,
  allowedCategories: Set<string>,
  vipSenders: Set<string>,
  threadCategory: string | null,
  fromAddress?: string,
): boolean {
  if (!smartEnabled) return true; // Smart notifications off → notify everything
  if (fromAddress && vipSenders.has(normalizeEmail(fromAddress))) return true; // VIP always notifies
  const category = threadCategory ?? "Primary"; // uncategorized defaults to Primary
  return allowedCategories.has(category);
}

/**
 * Show a notification for a follow-up reminder that fired.
 */
export function notifyFollowUpDue(
  subject: string,
  threadId?: string,
  accountId?: string,
): void {
  if (!notificationsEnabled) return;
  const ctx = { threadId, accountId, subject };
  lastNotificationContext = ctx;
  if (threadId) recentContexts.set(threadId, ctx);
  sendNotification({
    title: "Follow up needed",
    body: subject || "(No subject)",
    actionTypeId: "email",
  });
}

/**
 * Show a notification for a snoozed email returning.
 */
export function notifySnoozeReturn(subject: string): void {
  if (!notificationsEnabled) return;
  sendNotification({
    title: "Snoozed email returned",
    body: subject || "(No subject)",
    actionTypeId: "default",
  });
}
