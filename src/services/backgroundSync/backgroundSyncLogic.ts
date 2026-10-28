/**
 * Pure decision logic for Android background sync (no I/O, unit-tested).
 */
import type { NativeBgSyncStatus } from "./nativeBgSync";

export type ServiceAction = "start" | "stop" | "none";

/** Bring the native service in line with the user's setting. */
export function decideServiceAction(enabled: boolean, running: boolean): ServiceAction {
  if (enabled && !running) return "start";
  if (!enabled && running) return "stop";
  return "none";
}

/**
 * Android 13+ only shows the notification permission prompt a limited number
 * of times; once the user has denied it, the only way back is the system
 * settings screen.
 */
export type NotificationPermissionStep = "granted" | "ask" | "open-settings";

export function notificationPermissionStep(
  granted: boolean,
  deniedAfterAsking: boolean,
): NotificationPermissionStep {
  if (granted) return "granted";
  return deniedAfterAsking ? "open-settings" : "ask";
}

/** Xiaomi/Redmi/POCO phones (MIUI/HyperOS) need an extra "Autostart" permission. */
export function needsOemAutostart(manufacturer: string): boolean {
  return /^(xiaomi|redmi|poco)$/i.test(manufacturer.trim());
}

export interface BackgroundSyncView {
  /** One-line summary shown under the toggle. */
  summary: string;
  notifications: NotificationPermissionStep;
  /** Battery optimisation still applies; offer the exemption prompt. */
  showBatteryRow: boolean;
  showAutostartRow: boolean;
}

export function describeBackgroundSync(
  enabled: boolean,
  status: NativeBgSyncStatus,
  deniedAfterAsking: boolean,
): BackgroundSyncView {
  const notifications = notificationPermissionStep(status.notificationsEnabled, deniedAfterAsking);
  let summary: string;
  if (!enabled) {
    summary = "Velo only checks for mail while it is open.";
  } else if (!status.running) {
    summary = "Not running. Open Velo to resume background sync.";
  } else if (notifications !== "granted") {
    summary = "Syncing in the background, but notifications are off.";
  } else if (!status.ignoringBatteryOptimizations) {
    summary = "Syncing in the background. Allow unrestricted battery use so Android doesn't stop it.";
  } else {
    summary = "Syncing in the background. You'll be notified about new mail.";
  }
  return {
    summary,
    notifications,
    showBatteryRow: enabled && !status.ignoringBatteryOptimizations,
    showAutostartRow: enabled && needsOemAutostart(status.manufacturer),
  };
}
