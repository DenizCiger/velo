package com.velomail.bgsync

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * Periodic wake-up while the device sleeps. The foreground service keeps the
 * process alive and on the network, but with the screen off the CPU suspends
 * and JS timers simply stop firing. This alarm wakes the CPU, keeps it awake
 * with a short partial wake lock (released by `sync_done` or after a timeout)
 * and asks the webview to sync now.
 */
class BgSyncAlarmReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (!BgSyncService.running) return
    BgSyncService.scheduleAlarm(context)
    if (BgSyncPlugin.requestSync()) {
      BgSyncService.acquireWakeLock(context)
      Log.d(BgSyncService.TAG, "alarm: sync requested")
    } else {
      Log.i(BgSyncService.TAG, "alarm: no webview listener")
    }
  }
}
