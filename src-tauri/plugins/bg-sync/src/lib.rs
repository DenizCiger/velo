//! Android background sync: a foreground service that keeps the app process,
//! and with it the webview running the TypeScript sync loop, alive while the
//! app is in the background. All logic lives in the Kotlin plugin under
//! `android/`; this crate only registers it. Mobile builds only.

use tauri::{
    plugin::{Builder, TauriPlugin},
    Runtime,
};

#[cfg(target_os = "android")]
struct NativeHandle<R: Runtime>(#[allow(dead_code)] tauri::plugin::PluginHandle<R>);

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("bg-sync")
        .setup(|_app, _api| {
            #[cfg(target_os = "android")]
            {
                use tauri::Manager;
                let handle = _api.register_android_plugin("com.velomail.bgsync", "BgSyncPlugin")?;
                _app.manage(NativeHandle(handle));
            }
            Ok(())
        })
        .build()
}
