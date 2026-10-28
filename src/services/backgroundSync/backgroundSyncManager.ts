/**
 * Android background sync: keeps the app process (and so this webview and the
 * regular 60s sync timer in syncManager) alive with a native foreground
 * service while the user has "Keep syncing in the background" enabled.
 *
 * Desktop/iOS: every export is a no-op.
 */
import { getSetting, setSetting } from "../db/settings";
import { onSyncCycleDone, syncAllNow } from "../gmail/syncManager";
import { decideServiceAction } from "./backgroundSyncLogic";
import {
  getNativeStatus,
  isBackgroundSyncSupported,
  onNativeStoppedByUser,
  onNativeSyncRequested,
  reportSyncDone,
  startNativeService,
  stopNativeService,
  type NativeBgSyncStatus,
} from "./nativeBgSync";

export const BACKGROUND_SYNC_SETTING = "background_sync_enabled";
/** Window event fired when the service state changes outside the settings UI. */
export const BACKGROUND_SYNC_CHANGED_EVENT = "velo-background-sync-changed";

let initialized = false;
let serviceRunning = false;

export async function isBackgroundSyncEnabled(): Promise<boolean> {
  return (await getSetting(BACKGROUND_SYNC_SETTING)) === "true";
}

async function applyState(enabled: boolean): Promise<NativeBgSyncStatus> {
  const status = await getNativeStatus();
  const action = decideServiceAction(enabled, status.running);
  let next = status;
  if (action === "start") next = await startNativeService();
  else if (action === "stop") next = await stopNativeService();
  serviceRunning = next.running;
  return next;
}

/**
 * Call once at app start, while the app is in the foreground (Android 12+ only
 * allows starting a foreground service then). Registers the native listeners
 * first: the service treats "no listener" as "no webview to sync with".
 */
export async function initBackgroundSync(): Promise<void> {
  if (!isBackgroundSyncSupported() || initialized) return;
  initialized = true;

  await onNativeSyncRequested(() => {
    // Alarm woke the CPU while the device slept. syncAllNow resolves after the
    // cycle, and the onSyncCycleDone hook below reports back (releasing the
    // wake lock); report here too in case there was nothing to sync.
    syncAllNow()
      .catch((err) => console.warn("[backgroundSync] wake-up sync failed:", err))
      .finally(() => {
        reportSyncDone().catch(() => {});
      });
  });

  await onNativeStoppedByUser(() => {
    serviceRunning = false;
    setSetting(BACKGROUND_SYNC_SETTING, "false")
      .catch(() => {})
      .finally(() => window.dispatchEvent(new Event(BACKGROUND_SYNC_CHANGED_EVENT)));
  });

  onSyncCycleDone(() => {
    if (serviceRunning) reportSyncDone().catch(() => {});
  });

  try {
    await applyState(await isBackgroundSyncEnabled());
  } catch (err) {
    console.warn("[backgroundSync] could not apply setting at startup:", err);
  }
}

/** Persist the setting and start/stop the service. Call from a user action. */
export async function setBackgroundSyncEnabled(enabled: boolean): Promise<NativeBgSyncStatus> {
  await setSetting(BACKGROUND_SYNC_SETTING, enabled ? "true" : "false");
  return applyState(enabled);
}

export async function getBackgroundSyncStatus(): Promise<NativeBgSyncStatus> {
  const status = await getNativeStatus();
  serviceRunning = status.running;
  return status;
}
