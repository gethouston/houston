//! Composio integration — plain async fns (transport-neutral).
//!
//! Houston's composio support is powered by the `composio` CLI. Each
//! function here is a thin wrapper around `cli::*` functions
//! that shell out to the binary at `~/.composio/composio`.
//!
//! Tauri command decorators live in the adapter crate (`houston-tauri`),
//! keeping this crate frontend-agnostic.

use crate::cli::{
    self, ComposioStatus, CompleteLoginError, StartLinkError, StartLinkResponse, StartLoginResponse,
};
use crate::install;
use crate::toolkits::normalize_toolkit_slugs;

/// Current state of Houston's composio integration.
pub async fn list_composio_connections() -> ComposioStatus {
    cli::status().await
}

/// True if the composio CLI is installed at the expected location.
pub fn is_composio_cli_installed() -> bool {
    install::is_installed()
}

/// Run Composio's official install script to put the CLI at
/// `~/.composio/composio`. Blocks until the binary is in place.
pub async fn install_composio_cli() -> Result<(), String> {
    install::install().await.map(|_| ())
}

/// Start the composio login flow. Returns `{login_url, cli_key}`.
pub async fn start_composio_oauth() -> Result<StartLoginResponse, String> {
    cli::start_login().await
}

/// Finish the login flow started by `start_composio_oauth`. The typed
/// error lets the engine server distinguish an expected "user never
/// approved" timeout from a genuine CLI fault (see `cli::complete_login`).
pub async fn complete_composio_login(cli_key: String) -> Result<(), CompleteLoginError> {
    cli::complete_login(&cli_key).await
}

/// Log the user out of Composio. Shells out to `composio logout -y`,
/// which clears `~/.composio/user_data.json`. After this the next
/// `status()` returns `NeedsAuth` and the UI snaps back to the sign-in
/// empty state.
pub async fn logout_composio() -> Result<(), String> {
    cli::logout().await
}

/// Start the flow to link an external app to the currently-signed-in
/// account. The typed error lets the engine server distinguish an expected
/// "already connected" no-op from a genuine CLI fault (see `cli::start_link`).
pub async fn connect_composio_app(
    toolkit: String,
) -> Result<StartLinkResponse, StartLinkError> {
    cli::start_link(&toolkit).await
}

/// Disconnect a linked app: removes every connected account for the
/// toolkit in the consumer namespace. See `cli::disconnect_toolkit`.
pub async fn disconnect_composio_app(toolkit: String) -> Result<(), String> {
    cli::disconnect_toolkit(&toolkit).await.map(|_| ())
}

/// Reconnect a linked app by refreshing its authentication. Returns the
/// browser URL the user must open to complete OAuth re-consent, or `None`
/// for auth schemes that refresh silently. See `cli::reconnect_toolkit`.
pub async fn reconnect_composio_app(toolkit: String) -> Result<Option<String>, String> {
    cli::reconnect_toolkit(&toolkit).await
}

/// List all available Composio apps from the REST API.
pub async fn list_composio_apps() -> Vec<crate::apps::ComposioAppEntry> {
    crate::apps::list_all_apps().await
}

/// List all connected toolkit slugs in the consumer namespace.
pub async fn list_composio_connected_toolkits() -> Vec<String> {
    normalize_toolkit_slugs(cli::list_connected_toolkits().await)
}
