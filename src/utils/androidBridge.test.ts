import { parseInsets, applyInsets, moveAppToBackground, initNativeInsets, hasAndroidBridge } from "./androidBridge";

describe("androidBridge", () => {
  afterEach(() => {
    delete (window as unknown as { VeloAndroid?: unknown }).VeloAndroid;
  });

  it("parses JSON strings and objects, defaulting bad fields to 0", () => {
    expect(parseInsets('{"top":24,"right":0,"bottom":23.5,"left":0,"ime":0}')).toEqual({
      top: 24, right: 0, bottom: 23.5, left: 0, ime: 0,
    });
    expect(parseInsets({ top: 10, bottom: "x" })).toEqual({ top: 10, right: 0, bottom: 0, left: 0, ime: 0 });
    expect(parseInsets("not json")).toBeNull();
    expect(parseInsets(null)).toBeNull();
  });

  it("writes CSS variables and the keyboard-open class", () => {
    const el = document.createElement("div");
    applyInsets({ top: 24, right: 0, bottom: 24, left: 0, ime: 300 }, el);
    expect(el.style.getPropertyValue("--native-inset-top")).toBe("24px");
    expect(el.style.getPropertyValue("--keyboard-inset")).toBe("276px");
    expect(el.classList.contains("keyboard-open")).toBe(true);

    applyInsets({ top: 24, right: 0, bottom: 24, left: 0, ime: 0 }, el);
    expect(el.style.getPropertyValue("--keyboard-inset")).toBe("0px");
    expect(el.classList.contains("keyboard-open")).toBe(false);
  });

  it("is a no-op without the native bridge", () => {
    expect(hasAndroidBridge()).toBe(false);
    expect(moveAppToBackground()).toBe(false);
    const cleanup = initNativeInsets();
    expect(typeof cleanup).toBe("function");
    cleanup();
  });

  it("calls through to the bridge and listens for inset events", () => {
    const moveTaskToBack = vi.fn();
    (window as unknown as { VeloAndroid: unknown }).VeloAndroid = {
      getInsets: () => '{"top":30,"right":0,"bottom":16,"left":0,"ime":0}',
      moveTaskToBack,
      setSystemBarsDark: vi.fn(),
    };
    expect(moveAppToBackground()).toBe(true);
    expect(moveTaskToBack).toHaveBeenCalled();

    const cleanup = initNativeInsets();
    const root = document.documentElement;
    expect(root.style.getPropertyValue("--native-inset-top")).toBe("30px");
    window.dispatchEvent(new CustomEvent("velo-native-insets", { detail: { top: 40, right: 0, bottom: 16, left: 0, ime: 0 } }));
    expect(root.style.getPropertyValue("--native-inset-top")).toBe("40px");
    cleanup();
  });
});
