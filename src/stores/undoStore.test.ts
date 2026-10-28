import { useUndoStore, UNDO_TIMEOUT_MS } from "./undoStore";

describe("undoStore", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useUndoStore.setState({ current: null });
  });
  afterEach(() => {
    useUndoStore.getState().flush();
    vi.useRealTimers();
  });

  it("commits after the timeout", () => {
    const commit = vi.fn();
    const revert = vi.fn();
    useUndoStore.getState().show({ message: "Archived", commit, revert });
    expect(useUndoStore.getState().current?.message).toBe("Archived");
    vi.advanceTimersByTime(UNDO_TIMEOUT_MS - 1);
    expect(commit).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(revert).not.toHaveBeenCalled();
    expect(useUndoStore.getState().current).toBeNull();
  });

  it("undo reverts and never commits", () => {
    const commit = vi.fn();
    const revert = vi.fn();
    useUndoStore.getState().show({ message: "Archived", commit, revert });
    useUndoStore.getState().undo();
    expect(revert).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(UNDO_TIMEOUT_MS * 2);
    expect(commit).not.toHaveBeenCalled();
  });

  it("showing a new action commits the previous one immediately", () => {
    const first = vi.fn();
    const second = vi.fn();
    useUndoStore.getState().show({ message: "a", commit: first, revert: vi.fn() });
    useUndoStore.getState().show({ message: "b", commit: second, revert: vi.fn() });
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
    expect(useUndoStore.getState().current?.message).toBe("b");
    vi.advanceTimersByTime(UNDO_TIMEOUT_MS);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("flush commits now; a failing commit does not throw", async () => {
    const commit = vi.fn().mockRejectedValue(new Error("offline"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    useUndoStore.getState().show({ message: "x", commit, revert: vi.fn() });
    expect(() => useUndoStore.getState().flush()).not.toThrow();
    expect(commit).toHaveBeenCalledTimes(1);
    await Promise.resolve();
    spy.mockRestore();
  });
});
