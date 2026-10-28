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

async function call<T>(command: string, fallback: T, args?: Record<string, unknown>): Promise<T> {
  if (!isBackgroundSyncSupported()) return fallback;
  return invoke<T>(`plugin:${PLUGIN}|${command}`, args);
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
/** Tell the service a sync cycle finished: releases the alarm wake lock, updates "Last checked". `error` is logged for diagnostics. */
export const reportSyncDone = (error?: string | null) =>
  call<void>("sync_done", undefined, error ? { error: sanitizeForLog(error) } : undefined);

/** Error text goes to logcat: drop anything address-like and keep it short. */
function sanitizeForLog(text: string): string {
  return text.replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "<email>").slice(0, 160);
}
export const requestIgnoreBatteryOptimizations = () =>
  call<{ opened: boolean }>("request_ignore_battery_optimizations", { opened: false });
export const openNotificationSettings = () =>
  call<{ opened: boolean }>("open_notification_settings", { opened: false });
/** Best-effort OEM autostart screen (MIUI/HyperOS), falling back to the app's settings page. */
export const openAutostartSettings = () =>
  call<{ opened: "oem" | "app_settings" | "none" }>("open_autostart_settings", { opened: "none" });

/** A new-mail notification, posted natively so a tap can say which thread it was for. */
export interface AndroidMailNotification {
  id: number;
  title: string;
  body: string;
  lines?: string[];
  summary?: string;
  threadId?: string;
  accountId?: string;
}

export interface MailNotificationTap {
  threadId?: string | null;
  accountId?: string | null;
}

export const notifyNewMail = (n: AndroidMailNotification) =>
  call<{ shown: boolean }>("notify_new_mail", { shown: false }, { ...n });
/** A tap that launched the app before the listener below existed (cold start). */
export const takePendingMailTap = async (): Promise<MailNotificationTap | null> =>
  (await call<{ tap?: MailNotificationTap }>("take_pending_tap", {})).tap ?? null;

async function listen<T = unknown>(event: string, cb: (payload: T) => void): Promise<PluginListener | null> {
  if (!isBackgroundSyncSupported()) return null;
  return addPluginListener<T>(PLUGIN, event, cb);
}

/** The service's wake-up alarm fired while the device slept: sync now. */
export const onNativeSyncRequested = (cb: () => void) => listen("syncRequested", cb);
/** The user tapped "Stop syncing" in the persistent notification. */
export const onNativeStoppedByUser = (cb: () => void) => listen("stoppedByUser", cb);
/** The user tapped a new-mail notification while the app was running. */
export const onMailNotificationTapped = (cb: (tap: MailNotificationTap) => void) =>
  listen<MailNotificationTap>("mailNotificationTapped", cb);
