import {
  decideServiceAction,
  describeBackgroundSync,
  needsOemAutostart,
  notificationPermissionStep,
} from "./backgroundSyncLogic";
import type { NativeBgSyncStatus } from "./nativeBgSync";

const status = (over: Partial<NativeBgSyncStatus> = {}): NativeBgSyncStatus => ({
  running: true,
  notificationsEnabled: true,
  ignoringBatteryOptimizations: true,
  manufacturer: "Google",
  sdkInt: 36,
  ...over,
});

describe("decideServiceAction", () => {
  it("starts when enabled and not running", () => {
    expect(decideServiceAction(true, false)).toBe("start");
  });
  it("stops when disabled and running", () => {
    expect(decideServiceAction(false, true)).toBe("stop");
  });
  it("does nothing when already in the desired state", () => {
    expect(decideServiceAction(true, true)).toBe("none");
    expect(decideServiceAction(false, false)).toBe("none");
  });
});

describe("notificationPermissionStep", () => {
  it("is granted regardless of earlier denials", () => {
    expect(notificationPermissionStep(true, true)).toBe("granted");
  });
  it("asks first, then sends the user to settings after a denial", () => {
    expect(notificationPermissionStep(false, false)).toBe("ask");
    expect(notificationPermissionStep(false, true)).toBe("open-settings");
  });
});

describe("needsOemAutostart", () => {
  it.each(["Xiaomi", "xiaomi", "Redmi", "POCO", " Xiaomi "])("matches %s", (m) => {
    expect(needsOemAutostart(m)).toBe(true);
  });
  it.each(["Google", "samsung", "", "XiaomiFake"])("does not match %s", (m) => {
    expect(needsOemAutostart(m)).toBe(false);
  });
});

describe("describeBackgroundSync", () => {
  it("hides helper rows while disabled", () => {
    const v = describeBackgroundSync(false, status({ running: false, ignoringBatteryOptimizations: false, manufacturer: "Xiaomi" }), false);
    expect(v.showBatteryRow).toBe(false);
    expect(v.showAutostartRow).toBe(false);
    expect(v.summary).toMatch(/only checks for mail while it is open/);
  });

  it("reports a service that should run but doesn't", () => {
    expect(describeBackgroundSync(true, status({ running: false }), false).summary).toMatch(/Not running/);
  });

  it("flags missing notification permission before battery", () => {
    const v = describeBackgroundSync(true, status({ notificationsEnabled: false, ignoringBatteryOptimizations: false }), true);
    expect(v.notifications).toBe("open-settings");
    expect(v.summary).toMatch(/notifications are off/);
    expect(v.showBatteryRow).toBe(true);
  });

  it("asks for the battery exemption, and autostart on Xiaomi", () => {
    const v = describeBackgroundSync(true, status({ ignoringBatteryOptimizations: false, manufacturer: "Xiaomi" }), false);
    expect(v.summary).toMatch(/unrestricted battery/);
    expect(v.showBatteryRow).toBe(true);
    expect(v.showAutostartRow).toBe(true);
  });

  it("is all good when everything is granted", () => {
    const v = describeBackgroundSync(true, status(), false);
    expect(v.summary).toMatch(/You'll be notified/);
    expect(v.showBatteryRow).toBe(false);
    expect(v.showAutostartRow).toBe(false);
    expect(v.notifications).toBe("granted");
  });
});
