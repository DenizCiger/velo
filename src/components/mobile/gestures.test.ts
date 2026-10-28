import { shouldCommitSwipe, SWIPE_COMMIT_RATIO } from "./SwipeableRow";
import { pullDistance, PULL_TRIGGER } from "@/hooks/usePullToRefresh";

describe("shouldCommitSwipe", () => {
  const width = 400;
  const threshold = width * SWIPE_COMMIT_RATIO;

  it("commits past the distance threshold in either direction", () => {
    expect(shouldCommitSwipe(threshold, width, 0)).toBe(true);
    expect(shouldCommitSwipe(-threshold - 1, width, 0)).toBe(true);
    expect(shouldCommitSwipe(threshold - 1, width, 0)).toBe(false);
  });

  it("commits a fast fling in the same direction", () => {
    expect(shouldCommitSwipe(threshold / 3, width, 1.2)).toBe(true);
    expect(shouldCommitSwipe(-threshold / 3, width, -1.2)).toBe(true);
  });

  it("ignores flings that are too short or reversed", () => {
    expect(shouldCommitSwipe(5, width, 2)).toBe(false);
    expect(shouldCommitSwipe(threshold / 3, width, -1.2)).toBe(false);
  });
});

describe("pullDistance", () => {
  it("is zero for upward or no movement", () => {
    expect(pullDistance(0)).toBe(0);
    expect(pullDistance(-50)).toBe(0);
  });

  it("is monotonic, resistant and capped", () => {
    expect(pullDistance(50)).toBeLessThan(50);
    expect(pullDistance(100)).toBeGreaterThan(pullDistance(50));
    expect(pullDistance(10_000)).toBeLessThanOrEqual(112);
  });

  it("reaches the trigger with a reasonable pull", () => {
    expect(pullDistance(200)).toBeGreaterThanOrEqual(PULL_TRIGGER);
    expect(pullDistance(80)).toBeLessThan(PULL_TRIGGER);
  });
});
