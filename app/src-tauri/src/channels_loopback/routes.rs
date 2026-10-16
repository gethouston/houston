//! The two returns a channels-style connect can come back on: Slack's and
//! LinkedIn's. Each answers only its own path, and turns an accepted redirect
//! into the deep link the webview's settings landing already handles, so the
//! loopback and the `houston://` return land the same way.

use std::time::Duration;

use tauri::{AppHandle, Manager};

use super::registry::ChannelsLoopbackState;
use crate::oauth_loopback::callback::LoopbackRoute;

/// The path the gateway redirects a Slack connect to.
pub const SLACK_PATH: &str = "/channels/slack";
/// The path the gateway redirects a LinkedIn connect to.
pub const LINKEDIN_PATH: &str = "/linkedin";

/// Past the gateway's ten-minute connect flows, with room for the callback's
/// token exchange: the listener binds before the connect request starts the
/// flow. The listener lives in this process, so an app restart while the
/// person is on the provider's page drops it. Accepted: connecting again from
/// the app starts over.
pub const RETURN_TIMEOUT: Duration = Duration::from_secs(12 * 60);

fn release(app: &AppHandle, id: u64) -> Result<(), String> {
    app.state::<ChannelsLoopbackState>().take(id).map(drop)
}

pub static SLACK: LoopbackRoute = LoopbackRoute {
    tag: "channels-loopback",
    path: SLACK_PATH,
    timeout: RETURN_TIMEOUT,
    deep_link: channels_deep_link,
    release,
};

pub static LINKEDIN: LoopbackRoute = LoopbackRoute {
    tag: "linkedin-loopback",
    path: LINKEDIN_PATH,
    timeout: RETURN_TIMEOUT,
    deep_link: linkedin_deep_link,
    release,
};

/// Which return a listener waits for. Absent from the webview is Slack, the
/// one that came first.
#[derive(serde::Deserialize, Clone, Copy, Debug, Default, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ReturnProvider {
    #[default]
    Slack,
    Linkedin,
}

impl ReturnProvider {
    pub fn route(self) -> &'static LoopbackRoute {
        match self {
            ReturnProvider::Slack => &SLACK,
            ReturnProvider::Linkedin => &LINKEDIN,
        }
    }
}

/// The one non-empty `key` value in `query`, or `None` for none or several.
fn one_ticket<'q>(query: &'q str, key: &str) -> Option<&'q str> {
    let prefix = format!("{key}=");
    let mut tickets = query
        .split('&')
        .filter_map(|pair| pair.strip_prefix(prefix.as_str()));
    match (tickets.next(), tickets.next()) {
        (Some(ticket), None) if !ticket.is_empty() => Some(ticket),
        _ => None,
    }
}

/// The event payload for an accepted Slack return: the very link the
/// gateway's deep-link page opens. The ticket goes through verbatim; the
/// webview parses it. A redirect without exactly one non-empty `slack` value
/// is not one the gateway sends, so it gets the stale page.
pub fn channels_deep_link(query: &str) -> Option<String> {
    one_ticket(query, "slack").map(|t| format!("houston://settings/channels?slack={t}"))
}

/// The same for a LinkedIn return, carrying one `linkedin` ticket.
pub fn linkedin_deep_link(query: &str) -> Option<String> {
    one_ticket(query, "linkedin").map(|t| format!("houston://settings/linkedin?linkedin={t}"))
}
