//! Single-connection SQLite pool for tauri-plugin-sql (mobile).
//!
//! The frontend runs transactions as separate IPC calls (`BEGIN`, statements,
//! `COMMIT`; see src/services/db/migrations.ts and connection.ts). With the
//! plugin's default sqlx pool those calls can land on *different* connections:
//! sqlx returns a connection to the pool asynchronously (after a ping), so the
//! next call often finds no idle connection and opens a second one. One
//! connection then holds the transaction's write lock while another waits out
//! the 5s busy timeout and fails with "database is locked (code 5)". It shows up
//! on the first launch, when the migrations run inside a long transaction.
//!
//! Replacing the preloaded pool with a `max_connections(1)` pool makes every
//! statement use the same connection, so frontend transactions behave. The
//! frontend must then use `Database.get()` (not `load()`, which would build a
//! fresh default pool) — see src/services/db/connection.ts.

use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use tauri::{
    plugin::{Builder, TauriPlugin},
    Manager, Runtime,
};

/// Must match the `preload` entry in tauri.conf.json and connection.ts.
pub const DB_URL: &str = "sqlite:velo.db";
const DB_FILE: &str = "velo.db";

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("velo-db-pool")
        .setup(|app, _api| {
            // Same location tauri-plugin-sql uses for "sqlite:<file>"
            let path = app.path().app_config_dir()?.join(DB_FILE);
            let handle = app.clone();
            tauri::async_runtime::block_on(async move {
                let options = SqliteConnectOptions::new()
                    .filename(&path)
                    .create_if_missing(true)
                    .foreign_keys(true);
                let pool = SqlitePoolOptions::new()
                    .max_connections(1)
                    .connect_with(options)
                    .await?;
                match handle.try_state::<tauri_plugin_sql::DbInstances>() {
                    Some(instances) => {
                        instances
                            .0
                            .write()
                            .await
                            .insert(DB_URL.to_string(), tauri_plugin_sql::DbPool::Sqlite(pool));
                        log::info!("velo-db-pool: using a single-connection pool for {DB_URL}");
                    }
                    None => log::warn!("velo-db-pool: tauri-plugin-sql not initialized; pool not replaced"),
                }
                Ok::<(), sqlx::Error>(())
            })?;
            Ok(())
        })
        .build()
}
