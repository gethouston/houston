//! Decides what each tracing record becomes in Sentry: a standalone event,
//! a breadcrumb, or nothing.
//!
//! Records bridged from the `log` crate (every Tauri plugin, reqwest, rustls,
//! `rustls-platform-verifier`…) reach tracing through `tracing_log::LogTracer`
//! with the STATIC target `"log"`; the real module path only exists in the
//! event's fields (`log.target`). A `SentryLayer::event_filter` closure sees
//! that static `Metadata`, so any target-based rule silently matches nothing
//! for exactly the crates it was written for. This module therefore hooks
//! `event_mapper`, which receives the whole event and can recover the emitting
//! target via `NormalizeEvent::normalized_metadata`.
use sentry_tracing::{breadcrumb_from_event, event_from_event, EventFilter, EventMapping};
use tracing::{Event, Subscriber};
use tracing_log::NormalizeEvent;
use tracing_subscriber::layer::Context;
use tracing_subscriber::registry::LookupSpan;

/// `event_mapper` for `sentry_tracing::layer()`: same shape as the layer's
/// built-in mapping (ERROR → event, WARN/INFO → breadcrumb, below → ignored),
/// except that demoted targets never become standalone events.
pub fn map_event<S>(event: &Event<'_>, _ctx: Context<'_, S>) -> EventMapping
where
    S: Subscriber + for<'a> LookupSpan<'a>,
{
    // Span attributes are not enabled on the layer, so no span context is
    // attached — identical to the layer's default path.
    let no_span: Option<&Context<'_, S>> = None;
    let filter = filter_for(event);
    let mut items = Vec::with_capacity(2);
    if filter.contains(EventFilter::Breadcrumb) {
        items.push(EventMapping::Breadcrumb(breadcrumb_from_event(
            event, no_span,
        )));
    }
    if filter.contains(EventFilter::Event) {
        items.push(EventMapping::Event(event_from_event(event, no_span)));
    }
    EventMapping::Combined(items.into())
}

/// Resolves the Sentry action for one record from its EFFECTIVE target.
pub fn filter_for(event: &Event<'_>) -> EventFilter {
    let normalized = event.normalized_metadata();
    let metadata = normalized.as_ref().unwrap_or_else(|| event.metadata());
    if demote_error_to_breadcrumb(metadata.target()) {
        EventFilter::Breadcrumb
    } else {
        sentry_tracing::default_event_filter(metadata)
    }
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
pub fn demote_error_to_breadcrumb(target: &str) -> bool {
    target.starts_with("tauri_plugin_updater") || target.starts_with("rustls_platform_verifier")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, Mutex, Once};
    use tracing_subscriber::layer::SubscriberExt;

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
        assert!(!demote_error_to_breadcrumb(
            "houston_app::engine_supervisor"
        ));
        assert!(!demote_error_to_breadcrumb("tauri_plugin_sentry"));
    }

    /// Records every decision `filter_for` makes, keyed by message, so tests
    /// can emit through the real `log` → tracing bridge and assert on the
    /// outcome the Sentry layer would act on.
    struct Recorder(Arc<Mutex<Vec<(String, EventFilter)>>>);

    impl<S: Subscriber> tracing_subscriber::Layer<S> for Recorder {
        fn on_event(&self, event: &Event<'_>, _ctx: Context<'_, S>) {
            let mut message = String::new();
            event.record(
                &mut |field: &tracing::field::Field, value: &dyn std::fmt::Debug| {
                    if field.name() == "message" {
                        message = format!("{value:?}");
                    }
                },
            );
            self.0
                .lock()
                .expect("recorder")
                .push((message, filter_for(event)));
        }
    }

    fn install_log_bridge() {
        static ONCE: Once = Once::new();
        ONCE.call_once(|| tracing_log::LogTracer::init().expect("install log bridge"));
    }

    fn decisions(emit: impl FnOnce()) -> Vec<(String, EventFilter)> {
        install_log_bridge();
        let sink = Arc::new(Mutex::new(Vec::new()));
        let subscriber = tracing_subscriber::registry().with(Recorder(sink.clone()));
        tracing::subscriber::with_default(subscriber, emit);
        let out = sink.lock().expect("recorder").clone();
        out
    }

    fn decision_for<'a>(all: &'a [(String, EventFilter)], needle: &str) -> &'a EventFilter {
        &all.iter()
            .find(|(message, _)| message.contains(needle))
            .unwrap_or_else(|| panic!("no decision recorded for {needle}"))
            .1
    }

    #[test]
    fn log_bridged_verifier_error_is_demoted_by_its_real_target() {
        let all = decisions(|| {
            log::error!(
                target: "rustls_platform_verifier::verification::windows",
                "failed to verify TLS certificate: invalid peer certificate: UnknownIssuer"
            );
        });
        let decision = decision_for(&all, "UnknownIssuer");
        assert!(decision.contains(EventFilter::Breadcrumb));
        assert!(!decision.contains(EventFilter::Event));
    }

    #[test]
    fn log_bridged_updater_error_is_demoted_by_its_real_target() {
        let all = decisions(|| {
            log::error!(target: "tauri_plugin_updater::updater", "failed to check for updates");
        });
        let decision = decision_for(&all, "check for updates");
        assert!(decision.contains(EventFilter::Breadcrumb));
        assert!(!decision.contains(EventFilter::Event));
    }

    #[test]
    fn log_bridged_error_from_other_crates_still_becomes_an_event() {
        let all = decisions(|| {
            log::error!(target: "tauri_plugin_sentry", "plugin exploded");
        });
        assert!(decision_for(&all, "plugin exploded").contains(EventFilter::Event));
    }

    #[test]
    fn native_tracing_error_still_becomes_an_event() {
        let all = decisions(|| {
            tracing::error!("engine sidecar crashed");
        });
        assert!(decision_for(&all, "sidecar crashed").contains(EventFilter::Event));
    }

    #[test]
    fn info_records_stay_breadcrumbs_and_debug_is_ignored() {
        let all = decisions(|| {
            log::info!(target: "tauri_plugin_updater::updater", "checking for updates");
            tracing::debug!("noise");
        });
        assert!(decision_for(&all, "checking for updates").contains(EventFilter::Breadcrumb));
        assert!(decision_for(&all, "noise").is_empty());
    }
}
