import {
  pushBackHandler,
  dispatchOverlayBack,
  getBackStackDepth,
  __resetBackStack,
  resolveRouteBack,
  isMailListPath,
} from "./backNavigation";

describe("overlay back stack", () => {
  beforeEach(() => __resetBackStack());

  it("returns false when nothing is registered", () => {
    expect(dispatchOverlayBack()).toBe(false);
  });

  it("invokes the most recently registered handler first (LIFO)", () => {
    const calls: string[] = [];
    pushBackHandler(() => calls.push("drawer"));
    const removeSheet = pushBackHandler(() => calls.push("sheet"));
    expect(getBackStackDepth()).toBe(2);
    expect(dispatchOverlayBack()).toBe(true);
    expect(calls).toEqual(["sheet"]);
    removeSheet();
    expect(dispatchOverlayBack()).toBe(true);
    expect(calls).toEqual(["sheet", "drawer"]);
  });

  it("unregistering a lower entry leaves the top intact", () => {
    const calls: string[] = [];
    const removeA = pushBackHandler(() => calls.push("a"));
    pushBackHandler(() => calls.push("b"));
    removeA();
    removeA(); // idempotent
    expect(getBackStackDepth()).toBe(1);
    dispatchOverlayBack();
    expect(calls).toEqual(["b"]);
  });
});

describe("resolveRouteBack", () => {
  it("goes from a thread to its list, keeping search params", () => {
    expect(resolveRouteBack("/mail/inbox/thread/t1", "?category=Updates", null)).toEqual({
      kind: "navigate",
      to: "/mail/inbox?category=Updates",
    });
    expect(resolveRouteBack("/label/Label_work/thread/t1", "", null)).toEqual({
      kind: "navigate",
      to: "/label/Label_work",
    });
    expect(resolveRouteBack("/smart-folder/sf1/thread/t9", "", null)).toEqual({
      kind: "navigate",
      to: "/smart-folder/sf1",
    });
  });

  it("goes from another list to the inbox", () => {
    expect(resolveRouteBack("/mail/starred", "", null)).toEqual({ kind: "navigate", to: "/mail/inbox" });
    expect(resolveRouteBack("/label/Label_work", "", "/mail/sent")).toEqual({ kind: "navigate", to: "/mail/inbox" });
  });

  it("exits from the inbox", () => {
    expect(resolveRouteBack("/mail/inbox", "", null)).toEqual({ kind: "exit" });
    expect(resolveRouteBack("/mail/inbox", "?category=Primary", "/mail/inbox")).toEqual({ kind: "exit" });
    expect(resolveRouteBack("/", "", null)).toEqual({ kind: "exit" });
  });

  it("returns from pages to the last visited list", () => {
    expect(resolveRouteBack("/settings/general", "", "/label/Label_travel")).toEqual({
      kind: "navigate",
      to: "/label/Label_travel",
    });
    expect(resolveRouteBack("/help/getting-started", "", null)).toEqual({ kind: "navigate", to: "/mail/inbox" });
    expect(resolveRouteBack("/tasks", "", "/mail/inbox")).toEqual({ kind: "navigate", to: "/mail/inbox" });
  });

  it("classifies list paths", () => {
    expect(isMailListPath("/mail/inbox")).toBe(true);
    expect(isMailListPath("/label/x")).toBe(true);
    expect(isMailListPath("/mail/inbox/thread/1")).toBe(false);
    expect(isMailListPath("/settings/general")).toBe(false);
  });
});
