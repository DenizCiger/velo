package com.velomail.bgsync

import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.os.SystemClock
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import java.text.DateFormat
import java.util.Date

/**
 * Foreground service whose only job is to keep the app process at foreground
 * service priority while Velo is in the background. That stops Android's
 * cached-app freezer from suspending the process (and its webview renderer),
 * exempts it from Doze network blocking, and lets the existing TypeScript sync
 * loop keep running.
 *
 * While the screen is off the CPU still sleeps; a periodic allow-while-idle
 * alarm wakes it, holds a short partial wake lock and asks the webview for a
 * sync (see [BgSyncAlarmReceiver]).
 */
class BgSyncService : Service() {
  companion object {
    const val TAG = "VeloSync"
    const val ACTION_START = "com.velomail.bgsync.START"
    const val ACTION_STOP = "com.velomail.bgsync.STOP"

    private const val CHANNEL_ID = "velo_background_sync"
    private const val RESUME_CHANNEL_ID = "velo_background_sync_status"
    private const val NOTIFICATION_ID = 0x7e10
    private const val RESUME_NOTIFICATION_ID = 0x7e11

    /** How often the CPU is woken while the device sleeps. Doze caps allow-while-idle alarms at ~1 per 9 min anyway. */
    private const val ALARM_INTERVAL_MS = 15L * 60 * 1000

    /** Upper bound on how long one alarm-triggered sync may keep the CPU awake. */
    private const val WAKE_LOCK_TIMEOUT_MS = 2L * 60 * 1000

    @Volatile
    var running = false
      private set

    @Volatile
    private var lastSyncAt = 0L

    private var wakeLock: PowerManager.WakeLock? = null

    fun start(context: Context) {
      val intent = Intent(context, BgSyncService::class.java).setAction(ACTION_START)
      ContextCompat.startForegroundService(context, intent)
    }

    fun stop(context: Context) {
      context.stopService(Intent(context, BgSyncService::class.java))
    }

    /** The webview that runs the sync loop went away (activity destroyed): stop and say so. */
    fun orphan(context: Context) {
      if (!running) return
      Log.i(TAG, "webview gone, stopping service")
      postResumeNotification(context, "Background sync stopped", "Velo was closed. Tap to resume syncing.")
      stop(context)
    }

    @Synchronized
    fun acquireWakeLock(context: Context) {
      val lock = wakeLock ?: (context.getSystemService(Context.POWER_SERVICE) as PowerManager)
        .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "velo:bg-sync")
        .also {
          it.setReferenceCounted(false)
          wakeLock = it
        }
      lock.acquire(WAKE_LOCK_TIMEOUT_MS)
    }

    @Synchronized
    fun releaseWakeLock() {
      wakeLock?.let { if (it.isHeld) it.release() }
    }

    /** Called after each completed sync cycle while the service runs. */
    fun onSyncDone(context: Context) {
      releaseWakeLock()
      lastSyncAt = System.currentTimeMillis()
      if (running) {
        val nm = NotificationManagerCompat.from(context)
        if (nm.areNotificationsEnabled()) {
          try {
            nm.notify(NOTIFICATION_ID, buildNotification(context))
          } catch (e: SecurityException) {
            // POST_NOTIFICATIONS revoked between the check and the call
          }
        }
      }
    }

    fun scheduleAlarm(context: Context) {
      val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
      val trigger = SystemClock.elapsedRealtime() + ALARM_INTERVAL_MS
      // Inexact allow-while-idle: needs no SCHEDULE_EXACT_ALARM permission and
      // still fires during Doze (rate-limited by the system).
      am.setAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, trigger, alarmIntent(context))
    }

    private fun cancelAlarm(context: Context) {
      val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
      am.cancel(alarmIntent(context))
    }

    private fun alarmIntent(context: Context): PendingIntent = PendingIntent.getBroadcast(
      context,
      0,
      Intent(context, BgSyncAlarmReceiver::class.java),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

    private fun openAppIntent(context: Context): PendingIntent? {
      val launch = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return null
      launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED)
      return PendingIntent.getActivity(
        context, 0, launch, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )
    }

    private fun ensureChannels(context: Context) {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
      val nm = context.getSystemService(NotificationManager::class.java)
      // IMPORTANCE_MIN: no sound, no status-bar icon, collapsed at the bottom of the shade.
      nm.createNotificationChannel(
        NotificationChannel(CHANNEL_ID, "Background sync", NotificationManager.IMPORTANCE_MIN).apply {
          description = "Shown while Velo keeps checking for new mail in the background"
          setShowBadge(false)
        },
      )
      nm.createNotificationChannel(
        NotificationChannel(RESUME_CHANNEL_ID, "Background sync status", NotificationManager.IMPORTANCE_LOW).apply {
          description = "Tells you when background sync stopped and needs Velo to be reopened"
          setShowBadge(false)
        },
      )
    }

    private fun buildNotification(context: Context): Notification {
      val stop = PendingIntent.getService(
        context,
        1,
        Intent(context, BgSyncService::class.java).setAction(ACTION_STOP),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )
      val text = if (lastSyncAt > 0) {
        "Last checked " + DateFormat.getTimeInstance(DateFormat.SHORT).format(Date(lastSyncAt))
      } else {
        "Checking for new mail in the background"
      }
      return NotificationCompat.Builder(context, CHANNEL_ID)
        .setSmallIcon(R.drawable.ic_stat_velo_sync)
        .setContentTitle("Velo is syncing")
        .setContentText(text)
        .setContentIntent(openAppIntent(context))
        .addAction(0, "Stop syncing", stop)
        .setOngoing(true)
        .setOnlyAlertOnce(true)
        .setSilent(true)
        .setShowWhen(false)
        .setPriority(NotificationCompat.PRIORITY_MIN)
        .setCategory(NotificationCompat.CATEGORY_SERVICE)
        .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
        .build()
    }

    private fun postResumeNotification(context: Context, title: String, text: String) {
      ensureChannels(context)
      val nm = NotificationManagerCompat.from(context)
      if (!nm.areNotificationsEnabled()) return
      val n = NotificationCompat.Builder(context, RESUME_CHANNEL_ID)
        .setSmallIcon(R.drawable.ic_stat_velo_sync)
        .setContentTitle(title)
        .setContentText(text)
        .setContentIntent(openAppIntent(context))
        .setAutoCancel(true)
        .setSilent(true)
        .build()
      try {
        nm.notify(RESUME_NOTIFICATION_ID, n)
      } catch (e: SecurityException) {
        // permission revoked
      }
    }

    private fun cancelResumeNotification(context: Context) {
      NotificationManagerCompat.from(context).cancel(RESUME_NOTIFICATION_ID)
    }
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    ensureChannels(this)
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (decideStart(intent?.action, BgSyncPlugin.isWebViewAlive())) {
      StartDecision.STOP_BY_USER -> {
        Log.i(TAG, "stopped from notification")
        BgSyncPlugin.notifyStoppedByUser()
        stopSelf()
        return START_NOT_STICKY
      }
      StartDecision.ORPHANED -> {
        Log.i(TAG, "started without webview (restart after process death), not running")
        if (intent == null) {
          postResumeNotification(this, "Background sync paused", "Android closed Velo. Tap to resume syncing.")
        }
        stopSelf()
        return START_NOT_STICKY
      }
      StartDecision.RUN -> Unit
    }

    try {
      val type = when {
        // specialUse has no daily time limit; dataSync is capped at 6h/24h on Android 15+.
        Build.VERSION.SDK_INT >= 34 -> ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE
        Build.VERSION.SDK_INT >= 29 -> ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
        else -> 0
      }
      ServiceCompat.startForeground(this, NOTIFICATION_ID, buildNotification(this), type)
    } catch (e: Exception) {
      // ForegroundServiceStartNotAllowedException (Android 12+, started from the
      // background) or a missing permission: fail soft instead of crashing.
      Log.w(TAG, "startForeground failed: ${e.javaClass.simpleName}")
      running = false
      stopSelf()
      return START_NOT_STICKY
    }

    if (!running) Log.i(TAG, "service started")
    running = true
    cancelResumeNotification(this)
    scheduleAlarm(this)
    // Sticky so that, if Android kills the process, the restart can tell the user (ORPHANED above).
    return START_STICKY
  }

  /** Android 15+: called when a time-limited FGS type (dataSync) runs out. Must stop within seconds. */
  override fun onTimeout(startId: Int, fgsType: Int) {
    Log.i(TAG, "foreground service timeout (type $fgsType)")
    postResumeNotification(this, "Background sync paused", "Android's daily limit was reached. Open Velo to resume.")
    stopSelf()
  }

  override fun onDestroy() {
    if (running) Log.i(TAG, "service stopped")
    running = false
    cancelAlarm(this)
    releaseWakeLock()
    super.onDestroy()
  }
}
