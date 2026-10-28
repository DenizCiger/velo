package com.velomail.app

import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat

class MainActivity : TauriActivity() {
  // Last known insets in CSS px (dp), serialized for the JS bridge.
  @Volatile
  private var insetsJson = """{"top":0,"right":0,"bottom":0,"left":0,"ime":0}"""

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
  }

  override fun onWebViewCreate(webView: WebView) {
    // Small native bridge used by src/utils/androidBridge.ts. It only exposes
    // window-chrome helpers (no data access), so it is safe to inject.
    webView.addJavascriptInterface(VeloBridge(), "VeloAndroid")

    // Report system bar / cutout / keyboard insets to the page. Older Android
    // WebViews return 0 for env(safe-area-inset-*) in edge-to-edge mode, and no
    // WebView reports the IME height, so the frontend reads these instead.
    ViewCompat.setOnApplyWindowInsetsListener(webView) { view, insets ->
      val density = resources.displayMetrics.density
      val bars = insets.getInsets(
        WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout()
      )
      val ime = insets.getInsets(WindowInsetsCompat.Type.ime())
      val json = """{"top":${bars.top / density},"right":${bars.right / density},""" +
        """"bottom":${bars.bottom / density},"left":${bars.left / density},"ime":${ime.bottom / density}}"""
      if (json != insetsJson) {
        insetsJson = json
        view.post {
          (view as WebView).evaluateJavascript(
            "window.dispatchEvent(new CustomEvent('velo-native-insets',{detail:$json}))",
            null,
          )
        }
      }
      // Let the WebView apply the insets too (it derives env(safe-area-inset-*) from them).
      ViewCompat.onApplyWindowInsets(view, insets)
    }
  }

  inner class VeloBridge {
    @JavascriptInterface
    fun getInsets(): String = insetsJson

    /** Behave like a launcher-root Back press: keep the app alive, show the home screen. */
    @JavascriptInterface
    fun moveTaskToBack() {
      runOnUiThread { this@MainActivity.moveTaskToBack(true) }
    }

    /** Match status/navigation bar icon colour to the app theme (not just the system theme). */
    @JavascriptInterface
    fun setSystemBarsDark(dark: Boolean) {
      runOnUiThread {
        val controller = WindowCompat.getInsetsController(window, window.decorView)
        controller.isAppearanceLightStatusBars = !dark
        controller.isAppearanceLightNavigationBars = !dark
      }
    }
  }
}
