import {
  detectPlatform,
  getPlatform,
  isMobilePlatform,
  isDesktopPlatform,
  applyPlatformClasses,
  __setPlatformForTests,
} from "./platform";

const ANDROID_UA =
  "Mozilla/5.0 (Linux; Android 16; 2311DRK48G; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/145.0 Mobile Safari/537.36";
const LINUX_UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/605.1.15 (KHTML, like Gecko)";

describe("detectPlatform", () => {
  it("uses the OS plugin answer when available", () => {
    expect(detectPlatform(() => "android", LINUX_UA)).toBe("android");
    expect(detectPlatform(() => "linux", ANDROID_UA)).toBe("linux");
    expect(detectPlatform(() => "macos", "")).toBe("macos");
    expect(detectPlatform(() => "windows", "")).toBe("windows");
  });

  it("falls back to the user agent when the plugin throws", () => {
    const boom = () => {
      throw new TypeError("Cannot read properties of undefined");
    };
    expect(detectPlatform(boom, ANDROID_UA)).toBe("android");
    expect(detectPlatform(boom, "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)")).toBe("ios");
    expect(detectPlatform(boom, LINUX_UA)).toBe("web");
  });

  it("ignores unknown plugin values", () => {
    expect(detectPlatform(() => "freebsd", LINUX_UA)).toBe("web");
    expect(detectPlatform(() => undefined, ANDROID_UA)).toBe("android");
  });
});

describe("platform predicates", () => {
  afterEach(() => __setPlatformForTests(null));

  it("treats android and ios as mobile", () => {
    __setPlatformForTests("android");
    expect(isMobilePlatform()).toBe(true);
    expect(isDesktopPlatform()).toBe(false);
    __setPlatformForTests("ios");
    expect(isMobilePlatform()).toBe(true);
  });

  it("treats linux/macos/windows as desktop", () => {
    for (const p of ["linux", "macos", "windows"] as const) {
      __setPlatformForTests(p);
      expect(isDesktopPlatform()).toBe(true);
      expect(isMobilePlatform()).toBe(false);
    }
  });

  it("treats a plain browser as neither", () => {
    __setPlatformForTests("web");
    expect(isDesktopPlatform()).toBe(false);
    expect(isMobilePlatform()).toBe(false);
  });

  it("resolves to web in jsdom without the Tauri OS plugin", () => {
    __setPlatformForTests(null);
    expect(getPlatform()).toBe("web");
  });

  it("applies html classes", () => {
    __setPlatformForTests("android");
    const el = document.createElement("html");
    applyPlatformClasses(el);
    expect(el.classList.contains("platform-android")).toBe(true);
    expect(el.classList.contains("platform-mobile")).toBe(true);
    expect(el.classList.contains("platform-desktop")).toBe(false);
  });
});
