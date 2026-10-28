package com.velomail.bgsync

/** What the service should do with an incoming start command. Pure, unit-tested. */
enum class StartDecision {
  /** Go (or stay) foreground and keep the app process alive. */
  RUN,

  /** The user tapped "Stop syncing" in the persistent notification. */
  STOP_BY_USER,

  /**
   * Started without a live webview, e.g. a START_STICKY restart after the
   * process was killed. A service alone cannot sync (the sync loop is
   * TypeScript in the webview), so tell the user and stop instead of showing a
   * "syncing" notification that would be a lie.
   */
  ORPHANED,
}

fun decideStart(action: String?, webViewAlive: Boolean): StartDecision = when {
  action == BgSyncService.ACTION_STOP -> StartDecision.STOP_BY_USER
  !webViewAlive -> StartDecision.ORPHANED
  else -> StartDecision.RUN
}
