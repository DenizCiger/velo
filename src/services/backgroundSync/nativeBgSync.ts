/**
 * JS side of the Android `bg-sync` plugin (src-tauri/plugins/bg-sync). Every
 * call is a no-op / resolves to a safe default off Android, so callers don't
 * need their own platform checks and desktop builds never touch the plugin.
 */
import { addPluginListener, invoke, type PluginListener } from "@tauri-apps/api/core";
import { getPlatform } from "@/utils/platform";

export interface NativeBgSyncStatus {
  running: boolean;
  notificationsEnabled: boolean;
  ignoringBatteryOptimizations: boolean;
  manufacturer: string;
  sdkInt: number;
}

const PLUGIN = "bg-sync";

export function isBackgroundSyncSupported(): boolean {
  return getPlatform() === "android";
}

async function call<T>(command: string, fallback: T): Promise<T> {
  if (!isBackgroundSyncSupported()) return fallback;
  return invoke<T>(`plugin:${PLUGIN}|${command}`);
}

const STOPPED: NativeBgSyncStatus = {
  running: false,
  notificationsEnabled: false,
  ignoringBatteryOptimizations: false,
  manufacturer: "",
  sdkInt: 0,
};

/** Start the foreground service. Only works while the app is in the foreground. */
export const startNativeService = () => call<NativeBgSyncStatus>("start", STOPPED);
export const stopNativeService = () => call<NativeBgSyncStatus>("stop", STOPPED);
export const getNativeStatus = () => call<NativeBgSyncStatus>("status", STOPPED);
/** Tell the service a sync cycle finished: releases the alarm wake lock, updates "Last checked". */
export const reportSyncDone = () => call<void>("sync_done", undefined);
export const requestIgnoreBatteryOptimizations = () =>
  call<{ opened: boolean }>("request_ignore_battery_optimizations", { opened: false });
export const openNotificationSettings = () =>
  call<{ opened: boolean }>("open_notification_settings", { opened: false });
/** Best-effort OEM autostart screen (MIUI/HyperOS), falling back to the app's settings page. */
export const openAutostartSettings = () =>
  call<{ opened: "oem" | "app_settings" | "none" }>("open_autostart_settings", { opened: "none" });

async function listen(event: string, cb: () => void): Promise<PluginListener | null> {
  if (!isBackgroundSyncSupported()) return null;
  return addPluginListener(PLUGIN, event, cb);
}

/** The service's wake-up alarm fired while the device slept: sync now. */
export const onNativeSyncRequested = (cb: () => void) => listen("syncRequested", cb);
/** The user tapped "Stop syncing" in the persistent notification. */
export const onNativeStoppedByUser = (cb: () => void) => listen("stoppedByUser", cb);
