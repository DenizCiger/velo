package com.velomail.bgsync

import org.junit.Assert.assertEquals
import org.junit.Test

class StartDecisionTest {
  @Test
  fun stopActionWinsEvenWithWebView() {
    assertEquals(StartDecision.STOP_BY_USER, decideStart(BgSyncService.ACTION_STOP, true))
    assertEquals(StartDecision.STOP_BY_USER, decideStart(BgSyncService.ACTION_STOP, false))
  }

  @Test
  fun stickyRestartWithoutWebViewIsOrphaned() {
    assertEquals(StartDecision.ORPHANED, decideStart(null, false))
    assertEquals(StartDecision.ORPHANED, decideStart(BgSyncService.ACTION_START, false))
  }

  @Test
  fun startWithWebViewRuns() {
    assertEquals(StartDecision.RUN, decideStart(BgSyncService.ACTION_START, true))
    assertEquals(StartDecision.RUN, decideStart(null, true))
  }
}
