import {
  buildNewMailNotification,
  NEW_MAIL_CHANNEL_ID,
  resolveNotificationTarget,
  SUMMARY_NOTIFICATION_ID,
  threadNotificationId,
} from "./newMailNotification";

const mail = (n: number, over: Record<string, string> = {}) => ({
  from: `Sender ${n}`,
  subject: `Subject ${n}`,
  threadId: `t${n}`,
  accountId: "acc1",
  ...over,
});

describe("buildNewMailNotification (desktop)", () => {
  it("keeps the original single and batch toasts", () => {
    expect(buildNewMailNotification([mail(1)], false)).toEqual({
      title: "Sender 1",
      body: "Subject 1",
      actionTypeId: "email",
    });
    expect(buildNewMailNotification([mail(1), mail(2)], false)).toEqual({
      title: "Velo",
      body: "2 new emails",
      actionTypeId: "email",
    });
  });

  it("returns null for an empty batch", () => {
    expect(buildNewMailNotification([], false)).toBeNull();
    expect(buildNewMailNotification([], true)).toBeNull();
  });

  it("uses a placeholder for empty subjects", () => {
    expect(buildNewMailNotification([mail(1, { subject: "" })], false)?.body).toBe("(No subject)");
  });
});

describe("buildNewMailNotification (android)", () => {
  it("targets the thread for a single message", () => {
    const n = buildNewMailNotification([mail(1)], true)!;
    expect(n.channelId).toBe(NEW_MAIL_CHANNEL_ID);
    expect(n.id).toBe(threadNotificationId("t1"));
    expect(n.extra).toEqual({ threadId: "t1", accountId: "acc1" });
    expect(n.title).toBe("Sender 1");
    expect(n.actionTypeId).toBeUndefined();
    expect(n.group).toBeTruthy();
  });

  it("summarises a burst in one replaceable notification", () => {
    const batch = Array.from({ length: 8 }, (_, i) => mail(i + 1));
    const n = buildNewMailNotification(batch, true)!;
    expect(n.id).toBe(SUMMARY_NOTIFICATION_ID);
    expect(n.title).toBe("8 new emails");
    expect(n.inboxLines).toHaveLength(6);
    expect(n.summary).toBe("+2 more");
    // several threads: a tap opens the inbox, not one thread
    expect(n.extra).toEqual({ accountId: "acc1" });
  });

  it("opens the thread when a burst is all in one thread", () => {
    const n = buildNewMailNotification([mail(1), mail(2, { threadId: "t1" })], true)!;
    expect(n.extra).toEqual({ threadId: "t1", accountId: "acc1" });
  });

  it("drops the account when the burst spans accounts", () => {
    const n = buildNewMailNotification([mail(1), mail(2, { accountId: "acc2" })], true)!;
    expect(n.extra).toEqual({});
  });
});

describe("threadNotificationId", () => {
  it("is stable, positive and avoids the reserved range", () => {
    expect(threadNotificationId("abc")).toBe(threadNotificationId("abc"));
    expect(threadNotificationId("abc")).not.toBe(threadNotificationId("abd"));
    for (const id of ["", "x", "18f2a9c0d1e2f3a4", "imap-acc-INBOX-12345"]) {
      const v = threadNotificationId(id);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(0x7fffffff);
      expect(v >= 0x7e00 && v <= 0x7eff).toBe(false);
    }
  });
});

describe("resolveNotificationTarget", () => {
  const fallback = { threadId: "last", accountId: "accX" };

  it("reads the thread from an Android tap", () => {
    const t = resolveNotificationTarget(
      { actionId: "tap", notification: { extra: { threadId: "t9", accountId: "acc1" } } },
      fallback,
    );
    expect(t).toEqual({ actionId: "tap", context: { threadId: "t9", accountId: "acc1" }, openInbox: false });
  });

  it("opens the inbox for an Android summary tap", () => {
    const t = resolveNotificationTarget({ actionId: "tap", notification: { extra: { accountId: "acc1" } } }, fallback);
    expect(t.openInbox).toBe(true);
    expect(t.context).toEqual({ threadId: undefined, accountId: "acc1" });
  });

  it("falls back to the last notification elsewhere", () => {
    const t = resolveNotificationTarget({ actionTypeId: "reply" }, fallback);
    expect(t).toEqual({ actionId: "reply", context: fallback, openInbox: false });
  });

  it("tolerates junk events", () => {
    expect(resolveNotificationTarget(null, null)).toEqual({ actionId: undefined, context: null, openInbox: false });
  });
});
