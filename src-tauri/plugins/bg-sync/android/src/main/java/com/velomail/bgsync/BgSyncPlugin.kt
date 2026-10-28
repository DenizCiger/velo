package com.velomail.bgsync

import android.annotation.SuppressLint
import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.ComponentName
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import android.util.Log
import android.webkit.WebView
import androidx.core.app.NotificationManagerCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleOwner
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

@TauriPlugin
class BgSyncPlugin(private val activity: Activity) : Plugin(activity) {
  companion object {
    private const val EVENT_SYNC = "syncRequested"
    private const val EVENT_STOPPED = "stoppedByUser"

    @Volatile
    private var instance: BgSyncPlugin? = null

    /** True while a webview with a registered sync listener exists. */
    fun isWebViewAlive(): Boolean = instance?.hasListener(EVENT_SYNC) == true

    /** Ask the webview to run a sync cycle now. Returns false if nobody is listening. */
    fun requestSync(): Boolean {
      val p = instance ?: return false
      if (!p.hasListener(EVENT_SYNC)) return false
      p.trigger(EVENT_SYNC, JSObject())
      return true
    }

    fun notifyStoppedByUser() {
      instance?.trigger(EVENT_STOPPED, JSObject())
    }
  }

  override fun load(webView: WebView) {
    super.load(webView)
    instance = this
  }

  override fun onDestroy() {
    super.onDestroy()
    if (instance === this) instance = null
    // Swiping Velo away from recents destroys the activity and its webview but
    // not the process; without the webview nothing syncs, so don't keep the
    // service (and a misleading "syncing" notification) around.
    if (!activity.isChangingConfigurations) BgSyncService.orphan(activity.applicationContext)
  }

  private fun isInForeground(): Boolean =
    (activity as? LifecycleOwner)?.lifecycle?.currentState?.isAtLeast(Lifecycle.State.STARTED) ?: true

  @Command
  fun start(invoke: Invoke) {
    if (BgSyncService.running) {
      invoke.resolve(statusObject())
      return
    }
    // Android 12+ forbids starting a foreground service from the background;
    // only start while the activity is visible (app start or settings toggle).
    if (!isInForeground()) {
      invoke.reject("Background sync can only be started while Velo is open")
      return
    }
    try {
      BgSyncService.start(activity.applicationContext)
      invoke.resolve(statusObject(runningOverride = true))
    } catch (e: Exception) {
      Log.w(BgSyncService.TAG, "start failed: ${e.javaClass.simpleName}")
      invoke.reject("Could not start background sync: ${e.javaClass.simpleName}")
    }
  }

  @Command
  fun stop(invoke: Invoke) {
    BgSyncService.stop(activity.applicationContext)
    invoke.resolve(statusObject(runningOverride = false))
  }

  @Command
  fun status(invoke: Invoke) {
    invoke.resolve(statusObject())
  }

  @Command
  fun syncDone(invoke: Invoke) {
    BgSyncService.onSyncDone(activity.applicationContext)
    invoke.resolve()
  }

  @SuppressLint("BatteryLife") // sideloaded app; the direct prompt is the friendliest option
  @Command
  fun requestIgnoreBatteryOptimizations(invoke: Invoke) {
    val pkg = activity.packageName
    val opened = tryStart(
      Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:$pkg")),
    ) || tryStart(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)) ||
      tryStart(appDetailsIntent())
    invoke.resolve(JSObject().put("opened", opened))
  }

  /** For when the notification permission was denied permanently and Android won't prompt again. */
  @Command
  fun openNotificationSettings(invoke: Invoke) {
    val intent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
        .putExtra(Settings.EXTRA_APP_PACKAGE, activity.packageName)
    } else {
      appDetailsIntent()
    }
    invoke.resolve(JSObject().put("opened", tryStart(intent) || tryStart(appDetailsIntent())))
  }

  /**
   * Best effort: MIUI/HyperOS hide "Autostart" in their own security app, other
   * OEMs have similar screens. Falls back to the app's system settings page.
   */
  @Command
  fun openAutostartSettings(invoke: Invoke) {
    val oemScreens = listOf(
      ComponentName("com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity"),
      ComponentName("com.miui.securitycenter", "com.miui.powercenter.PowerSettings"),
    )
    var opened = "none"
    if (Build.MANUFACTURER.equals("xiaomi", ignoreCase = true) ||
      Build.MANUFACTURER.equals("redmi", ignoreCase = true) ||
      Build.MANUFACTURER.equals("poco", ignoreCase = true)
    ) {
      for (c in oemScreens) {
        if (tryStart(Intent().setComponent(c).putExtra("package_name", activity.packageName))) {
          opened = "oem"
          break
        }
      }
    }
    if (opened == "none" && tryStart(appDetailsIntent())) opened = "app_settings"
    invoke.resolve(JSObject().put("opened", opened))
  }

  private fun appDetailsIntent() =
    Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${activity.packageName}"))

  private fun tryStart(intent: Intent): Boolean = try {
    activity.startActivity(intent)
    true
  } catch (e: ActivityNotFoundException) {
    false
  } catch (e: SecurityException) {
    // Non-exported OEM activity
    false
  }

  private fun statusObject(runningOverride: Boolean? = null): JSObject {
    val pm = activity.getSystemService(PowerManager::class.java)
    return JSObject()
      .put("running", runningOverride ?: BgSyncService.running)
      .put("notificationsEnabled", NotificationManagerCompat.from(activity).areNotificationsEnabled())
      .put("ignoringBatteryOptimizations", pm?.isIgnoringBatteryOptimizations(activity.packageName) == true)
      .put("manufacturer", Build.MANUFACTURER ?: "")
      .put("sdkInt", Build.VERSION.SDK_INT)
  }
}
