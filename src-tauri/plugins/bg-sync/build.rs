// Commands are implemented in Kotlin (android/); Tauri forwards
// `plugin:bg-sync|<command>` to the native plugin, converting the name to
// lowerCamelCase. Listing them here generates the ACL permissions.
const COMMANDS: &[&str] = &[
    "start",
    "stop",
    "status",
    "sync_done",
    "request_ignore_battery_optimizations",
    "open_notification_settings",
    "open_autostart_settings",
    "register_listener",
    "remove_listener",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS)
        .android_path("android")
        .build();
}
