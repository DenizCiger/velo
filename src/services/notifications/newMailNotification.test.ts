import {
  buildAndroidMailNotification,
  buildDesktopMailNotification,
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

describe("buildDesktopMailNotification", () => {
  it("keeps the original single and batch toasts", () => {
    expect(buildDesktopMailNotification([mail(1)])).toEqual({
      title: "Sender 1",
      body: "Subject 1",
      actionTypeId: "email",
    });
    expect(buildDesktopMailNotification([mail(1), mail(2)])).toEqual({
      title: "Velo",
      body: "2 new emails",
      actionTypeId: "email",
    });
  });

  it("returns null for an empty batch", () => {
    expect(buildDesktopMailNotification([])).toBeNull();
    expect(buildAndroidMailNotification([])).toBeNull();
  });

  it("uses a placeholder for empty subjects", () => {
    expect(buildDesktopMailNotification([mail(1, { subject: "" })])?.body).toBe("(No subject)");
  });
});

describe("buildAndroidMailNotification", () => {
  it("targets the thread for a single message", () => {
    expect(buildAndroidMailNotification([mail(1)])).toEqual({
      id: threadNotificationId("t1"),
      title: "Sender 1",
      body: "Subject 1",
      threadId: "t1",
      accountId: "acc1",
    });
  });

  it("summarises a burst in one replaceable notification that opens the inbox", () => {
    const batch = Array.from({ length: 8 }, (_, i) => mail(i + 1));
    const n = buildAndroidMailNotification(batch)!;
    expect(n.id).toBe(SUMMARY_NOTIFICATION_ID);
    expect(n.title).toBe("8 new emails");
    expect(n.lines).toHaveLength(6);
    expect(n.summary).toBe("+2 more");
    expect(n.threadId).toBeUndefined();
    expect(n.accountId).toBe("acc1");
  });

  it("opens the thread when a burst is all in one thread", () => {
    const n = buildAndroidMailNotification([mail(1), mail(2, { threadId: "t1" })])!;
    expect(n.threadId).toBe("t1");
    expect(n.summary).toBeUndefined();
  });

  it("drops the account when the burst spans accounts", () => {
    const n = buildAndroidMailNotification([mail(1), mail(2, { accountId: "acc2" })])!;
    expect(n.accountId).toBeUndefined();
    expect(n.body).toBe("Sender 1, Sender 2");
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
