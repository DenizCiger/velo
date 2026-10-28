package com.velomail.bgsync

import android.annotation.SuppressLint
import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.ComponentName
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.provider.Settings
import android.util.Log
import android.view.View
import android.webkit.WebView
import androidx.core.app.NotificationManagerCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleOwner
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

@TauriPlugin
class BgSyncPlugin(private val activity: Activity) : Plugin(activity) {
  companion object {
    private const val EVENT_SYNC = "syncRequested"
    private const val EVENT_STOPPED = "stoppedByUser"
    private const val EVENT_MAIL_TAPPED = "mailNotificationTapped"

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

  private var webView: WebView? = null
  private val handler = Handler(Looper.getMainLooper())

  /** A new-mail tap that launched the activity before JS could listen (cold start). */
  private var pendingTap: JSObject? = null

  override fun load(webView: WebView) {
    super.load(webView)
    this.webView = webView
    instance = this
    activity.intent?.let { pendingTap = consumeMailTap(it) }
    if (pendingTap != null) Log.d(BgSyncService.TAG, "launched from a new-mail notification")
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    val tap = consumeMailTap(intent) ?: return
    if (hasListener(EVENT_MAIL_TAPPED)) trigger(EVENT_MAIL_TAPPED, tap) else pendingTap = tap
  }

  private fun consumeMailTap(intent: Intent): JSObject? {
    if (!intent.getBooleanExtra(MailNotifier.EXTRA_TAPPED, false)) return null
    val tap = JSObject()
      .put("threadId", intent.getStringExtra(MailNotifier.EXTRA_THREAD_ID))
      .put("accountId", intent.getStringExtra(MailNotifier.EXTRA_ACCOUNT_ID))
    // Don't replay the tap if the activity is recreated with the same intent
    intent.removeExtra(MailNotifier.EXTRA_TAPPED)
    return tap
  }

  @Command
  fun notifyNewMail(invoke: Invoke) {
    val args = invoke.parseArgs(NewMailArgs::class.java)
    invoke.resolve(JSObject().put("shown", MailNotifier.post(activity.applicationContext, args)))
  }

  @Command
  fun takePendingTap(invoke: Invoke) {
    val tap = pendingTap
    pendingTap = null
    invoke.resolve(JSObject().put("tap", tap))
  }

  /**
   * Keeping the process alive is not enough: ~60s after the activity stops,
   * Chromium suspends the hidden page's timers and message queues (measured on
   * the emulator: the 60s sync interval stopped firing while the process sat
   * unfrozen at foreground-service priority, and a 100ms setTimeout never
   * resolved). The WebView derives "hidden" from its window visibility, so
   * while background sync runs, tell it its window is still visible. There is
   * no surface to draw to, so this does not cause rendering work.
   */
  override fun onStop() {
    super.onStop()
    // Posted: the system dispatches the INVISIBLE window visibility around onStop.
    handler.postDelayed({ keepPageAwake() }, 500)
  }

  private fun keepPageAwake() {
    val wv = webView ?: return
    val stopped = (activity as? LifecycleOwner)?.lifecycle?.currentState?.isAtLeast(Lifecycle.State.STARTED) == false
    if (BgSyncService.running && stopped) {
      wv.dispatchWindowVisibilityChanged(View.VISIBLE)
      Log.d(BgSyncService.TAG, "keeping webview active in background")
    }
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
    // Diagnostics only: whether the cycle worked. A background sync that can't
    // reach Gmail still "finishes", so the heartbeat alone can't tell.
    val error = runCatching { invoke.parseArgs(SyncDoneArgs::class.java).error }.getOrNull()
    Log.i(BgSyncService.TAG, if (error.isNullOrEmpty()) "sync cycle finished: ok" else "sync cycle finished: error: $error")
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

@InvokeArg
class SyncDoneArgs {
  var error: String? = null
}
