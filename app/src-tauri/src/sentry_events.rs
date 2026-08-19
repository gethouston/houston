//! Decides what backend log output becomes in Sentry: breadcrumb or event.
//!
//! Registered by `logging::init` as the `sentry_tracing` layer. Uses an
//! `event_mapper` (not an `event_filter`) because of a `tracing-log` subtlety:
//! `log`-crate records (e.g. `tauri_plugin_updater`, `rustls_platform_verifier`)
//! reach tracing through `LogTracer`'s static callsites, whose
//! `Metadata::target()` is literally `"log"` — the real target only exists on
//! the *normalized* metadata. An `event_filter` sees only the callsite
//! metadata, so a target-based demote list silently never matches any
//! log-crate source (Sentry HOUSTON-APP-S: one event per failed 5-minute
//! update poll, from every release that "had" the HOU-1104 demote). The
//! mapper receives the full event and normalizes before deciding.

use sentry_tracing::{
    breadcrumb_from_event, default_event_filter, event_from_event, EventFilter, EventMapping,
    SentryLayer,
};
use tracing::{Event, Subscriber};
use tracing_log::NormalizeEvent;
use tracing_subscriber::layer::Context;
use tracing_subscriber::registry::LookupSpan;

/// The Sentry layer for the tracing registry: INFO+ becomes breadcrumbs,
/// ERROR becomes standalone events — except the demoted targets below.
pub fn layer<S>() -> SentryLayer<S>
where
    S: Subscriber + for<'a> LookupSpan<'a>,
{
    sentry_tracing::layer().event_mapper(map_event)
}

fn map_event<S>(event: &Event<'_>, _ctx: Context<'_, S>) -> EventMapping
where
    S: Subscriber + for<'a> LookupSpan<'a>,
{
    let normalized = event.normalized_metadata();
    let metadata = normalized.as_ref().unwrap_or_else(|| event.metadata());

    let filter = if demote_error_to_breadcrumb(metadata.target()) {
        EventFilter::Breadcrumb
    } else {
        default_event_filter(metadata)
    };

    // Mirror the layer's default (no-mapper) path, span attributes disabled.
    let span_ctx = None::<&Context<'_, S>>;
    let mut items = Vec::new();
    if filter.contains(EventFilter::Breadcrumb) {
        items.push(EventMapping::Breadcrumb(breadcrumb_from_event(
            event, span_ctx,
        )));
    }
    if filter.contains(EventFilter::Event) {
        items.push(EventMapping::Event(event_from_event(event, span_ctx)));
    }
    EventMapping::Combined(items.into())
}

/// Targets whose ERROR logs must NOT become standalone Sentry events.
///
/// `tauri_plugin_updater` fires `log::error!` on every unsuccessful update
/// check — including the expected ones (offline, GitHub unreachable or
/// returning a transient non-2xx for the channel manifest). The check
/// failure is fully handled in the frontend updater hooks, so Sentry only
/// needs the breadcrumb trail, not an event per 5-minute poll
/// (Sentry HOUSTON-APP-14, HOUSTON-APP-S).
///
/// `rustls_platform_verifier` fires `log::error!` internally whenever the
/// OS trust store rejects a peer certificate (e.g. a machine behind a
/// misconfigured corporate MITM proxy whose root even Windows won't chain).
/// The failing request already returns `Err` and its caller owns surfacing
/// it, so the verifier's own log line is a duplicate — one Sentry event per
/// retry from a handful of broken machines (Sentry HOUSTON-APP-PE).
fn demote_error_to_breadcrumb(target: &str) -> bool {
    target.starts_with("tauri_plugin_updater") || target.starts_with("rustls_platform_verifier")
}

#[cfg(test)]
mod tests {
    use super::*;
    use tracing_subscriber::prelude::*;

    /// Runs `f` under a registry carrying our layer, with the `log`-crate
    /// bridge installed, and returns the Sentry events captured — the same
    /// pipeline production records flow through.
    fn captured_events(f: impl FnOnce()) -> Vec<sentry::protocol::Event<'static>> {
        // First test to run installs the global log→tracing bridge; the
        // Err on subsequent calls just means it's already installed.
        let _ = tracing_log::LogTracer::init();
        let subscriber = tracing_subscriber::registry().with(layer());
        sentry::test::with_captured_events(|| tracing::subscriber::with_default(subscriber, f))
    }

    #[test]
    fn log_bridged_updater_error_stays_a_breadcrumb() {
        let events = captured_events(|| {
            log::error!(
                target: "tauri_plugin_updater::updater",
                "failed to check for updates: error sending request"
            );
        });
        assert!(events.is_empty(), "updater poll noise must not be an event");
    }

    #[test]
    fn log_bridged_tls_verifier_error_stays_a_breadcrumb() {
        let events = captured_events(|| {
            log::error!(
                target: "rustls_platform_verifier::verification::windows",
                "certificate verification failed"
            );
        });
        assert!(events.is_empty(), "TLS verifier noise must not be an event");
    }

    #[test]
    fn log_bridged_error_from_other_deps_still_becomes_an_event() {
        let events = captured_events(|| {
            log::error!(target: "some_dependency", "boom");
        });
        assert_eq!(events.len(), 1);
    }

    #[test]
    fn tracing_app_error_still_becomes_an_event() {
        let events = captured_events(|| {
            tracing::error!(target: "houston_app::engine_supervisor", "boom");
        });
        assert_eq!(events.len(), 1);
    }

    #[test]
    fn updater_plugin_errors_are_demoted_to_breadcrumbs() {
        assert!(demote_error_to_breadcrumb("tauri_plugin_updater::updater"));
        assert!(demote_error_to_breadcrumb("tauri_plugin_updater"));
    }

    #[test]
    fn tls_platform_verifier_errors_are_demoted_to_breadcrumbs() {
        assert!(demote_error_to_breadcrumb(
            "rustls_platform_verifier::verification::windows"
        ));
        assert!(demote_error_to_breadcrumb("rustls_platform_verifier"));
    }

    #[test]
    fn app_errors_still_become_sentry_events() {
        assert!(!demote_error_to_breadcrumb("houston_app"));
        assert!(!demote_error_to_breadcrumb("houston_app::engine_supervisor"));
        assert!(!demote_error_to_breadcrumb("tauri_plugin_sentry"));
    }
}
