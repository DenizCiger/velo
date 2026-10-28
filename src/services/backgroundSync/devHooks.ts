/**
 * DEV-ONLY helpers to verify background sync and new-mail notifications on an
 * emulator without a real mailbox. Only bundled when the app is built with
 * VITE_VELO_DEV_HOOKS=1 (see App.tsx); never part of a normal/release build.
 *
 * window.__veloDev.seedFakeAccount()  adds an IMAP account pointing at an
 *   unresolvable host (sync just fails), then reloads.
 * window.__veloDev.queueFakeMail(n)  on the next sync cycle (e.g. a background
 *   tick), stores n fake unread inbox messages and runs them through the same
 *   notification filters and queue the Gmail delta sync uses.
 */
import { getAllAccounts, insertImapAccount } from "../db/accounts";
import { upsertMessage } from "../db/messages";
import { getMutedThreadIds, setThreadLabels, upsertThread } from "../db/threads";
import { getSetting } from "../db/settings";
import { onSyncCycleDone } from "../gmail/syncManager";
import { queueNewEmailNotification, shouldNotifyForMessage } from "../notifications/notificationManager";

const DEV_ACCOUNT_ID = "dev-fake-account";
let armed = 0;
let seq = 0;

async function deliver(count: number): Promise<void> {
  const accounts = await getAllAccounts();
  if (!accounts.some((a) => a.id === DEV_ACCOUNT_ID)) {
    console.warn("[devHooks] no fake account; call seedFakeAccount() first");
    return;
  }
  const muted = await getMutedThreadIds(DEV_ACCOUNT_ID);
  const smart = (await getSetting("smart_notifications")) !== "false";
  const categories = new Set(((await getSetting("notify_categories")) ?? "Primary").split(",").map((s) => s.trim()));
  for (let i = 0; i < count; i++) {
    seq++;
    const now = Date.now();
    const threadId = `dev-thread-${now}-${seq}`;
    const fromName = `Fake Sender ${seq}`;
    const fromAddress = `fake.sender${seq}@example.invalid`;
    const subject = `Fake test message #${seq}`;
    await upsertThread({
      id: threadId, accountId: DEV_ACCOUNT_ID, subject, snippet: "This is seeded test data.",
      lastMessageAt: now, messageCount: 1, isRead: false, isStarred: false, isImportant: false, hasAttachments: false,
    });
    await upsertMessage({
      id: `dev-msg-${now}-${seq}`, accountId: DEV_ACCOUNT_ID, threadId, fromAddress, fromName,
      toAddresses: "dev-test@example.invalid", ccAddresses: null, bccAddresses: null, replyTo: null,
      subject, snippet: "This is seeded test data.", date: now, isRead: false, isStarred: false,
      bodyHtml: null, bodyText: "This is seeded test data for verifying notifications.", rawSize: null, internalDate: now,
    });
    await setThreadLabels(DEV_ACCOUNT_ID, threadId, ["INBOX", "UNREAD"]);
    if (!muted.has(threadId) && shouldNotifyForMessage(smart, categories, new Set(), null, fromAddress)) {
      queueNewEmailNotification(fromName, subject, threadId, DEV_ACCOUNT_ID, fromAddress);
    }
  }
  window.dispatchEvent(new Event("velo-sync-done"));
  console.log(`[devHooks] delivered ${count} fake message(s)`);
}

export function installDevHooks(): void {
  onSyncCycleDone(() => {
    if (armed > 0) {
      const n = armed;
      armed = 0;
      deliver(n).catch((err) => console.error("[devHooks] deliver failed:", err));
    }
  });

  (window as unknown as { __veloDev: unknown }).__veloDev = {
    async seedFakeAccount() {
      const accounts = await getAllAccounts();
      if (!accounts.some((a) => a.id === DEV_ACCOUNT_ID)) {
        await insertImapAccount({
          id: DEV_ACCOUNT_ID, email: "dev-test@example.invalid", displayName: "Dev Test (fake)", avatarUrl: null,
          imapHost: "imap.example.invalid", imapPort: 993, imapSecurity: "ssl",
          smtpHost: "smtp.example.invalid", smtpPort: 465, smtpSecurity: "ssl",
          authMethod: "password", password: "not-a-real-password",
        });
      }
      location.reload();
    },
    queueFakeMail(n = 1) {
      armed += n;
      console.log(`[devHooks] ${armed} fake message(s) armed for the next sync cycle`);
    },
    deliverNow: (n = 1) => deliver(n),
  };
  console.log("[devHooks] installed");
}
