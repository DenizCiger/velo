package com.velomail.bgsync

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import app.tauri.annotation.InvokeArg

@InvokeArg
class NewMailArgs {
  var id: Int = 0
  var title: String = ""
  var body: String = ""
  var lines: List<String>? = null
  var summary: String? = null
  var threadId: String? = null
  var accountId: String? = null
}

/**
 * New-mail notifications. Posted natively rather than through
 * tauri-plugin-notification because that plugin's Android tap event doesn't
 * say which notification was tapped (its `notification` payload is always
 * null), so it can't open the right thread. Here the thread/account ride in
 * the content intent and come back through [BgSyncPlugin.onNewIntent].
 */
object MailNotifier {
  const val CHANNEL_ID = "new_mail"
  const val EXTRA_THREAD_ID = "com.velomail.bgsync.THREAD_ID"
  const val EXTRA_ACCOUNT_ID = "com.velomail.bgsync.ACCOUNT_ID"
  const val EXTRA_TAPPED = "com.velomail.bgsync.MAIL_TAPPED"
  private const val GROUP = "velo-new-mail"

  private fun ensureChannel(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val nm = context.getSystemService(NotificationManager::class.java)
    if (nm.getNotificationChannel(CHANNEL_ID) != null) return
    nm.createNotificationChannel(
      NotificationChannel(CHANNEL_ID, "New mail", NotificationManager.IMPORTANCE_HIGH).apply {
        description = "A notification for each new email in your inbox"
        enableVibration(true)
        enableLights(true)
      },
    )
  }

  fun post(context: Context, args: NewMailArgs): Boolean {
    ensureChannel(context)
    val nm = NotificationManagerCompat.from(context)
    if (!nm.areNotificationsEnabled()) return false

    val launch = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return false
    launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    launch.putExtra(EXTRA_TAPPED, true)
    args.threadId?.let { launch.putExtra(EXTRA_THREAD_ID, it) }
    args.accountId?.let { launch.putExtra(EXTRA_ACCOUNT_ID, it) }
    val contentIntent = PendingIntent.getActivity(
      context, args.id, launch, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

    val builder = NotificationCompat.Builder(context, CHANNEL_ID)
      .setSmallIcon(R.drawable.ic_stat_velo_sync)
      .setContentTitle(args.title)
      .setContentText(args.body)
      .setContentIntent(contentIntent)
      .setAutoCancel(true)
      .setGroup(GROUP)
      .setCategory(NotificationCompat.CATEGORY_EMAIL)
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
      .setOnlyAlertOnce(false)
    val lines = args.lines
    if (!lines.isNullOrEmpty()) {
      val style = NotificationCompat.InboxStyle().setBigContentTitle(args.title)
      lines.forEach { style.addLine(it) }
      args.summary?.let { style.setSummaryText(it) }
      builder.setStyle(style)
    } else {
      builder.setStyle(NotificationCompat.BigTextStyle().bigText(args.body))
    }
    return try {
      nm.notify(args.id, builder.build())
      true
    } catch (e: SecurityException) {
      false
    }
  }
}
