//! Life Runtime adapter — remote provider speaking `life.v1` to a `lifed`
//! daemon over UDS (Stage 0) or `lifegw` HTTPS (Stage 1, future).
//!
//! Unlike the CLI providers, Life has no local binary — connection params
//! live in env vars (`LIFED_SOCK`, `LIFED_TOKEN`, `LIFED_USER`) read by
//! [`crate::life_runner::LifeRemoteRunner`] at spawn time. `resolve()` returns
//! [`InstallSource::Remote`] so the provider-control-plane in
//! `engine-core/provider/mod.rs` can branch on remote and skip the
//! path-dependent install/login flows.

use super::resolve::InstallSource;
use super::{ProbeFuture, ProviderAdapter};
use crate::provider_auth::ProviderAuthState;
use std::path::{Path, PathBuf};

pub(super) struct LifeAdapter;

pub(super) static LIFE: LifeAdapter = LifeAdapter;

impl ProviderAdapter for LifeAdapter {
    fn id(&self) -> &'static str {
        "life"
    }

    fn cli_name(&self) -> &'static str {
        // Diagnostic-only: no binary is spawned. Mirrors what an operator
        // would see in `ps` if a tonic-over-UDS client were a process.
        "lifed"
    }

    fn aliases(&self) -> &'static [&'static str] {
        &["lifed", "life-runtime"]
    }

    fn resolve(&self) -> (InstallSource, Option<PathBuf>) {
        // Life has no local binary — sessions route over gRPC/UDS or
        // gRPC-Web/HTTPS. The UI branches on `Remote` to render
        // "Configured externally" instead of "Not installed".
        (InstallSource::Remote, None)
    }

    fn probe_auth<'a>(&'a self, _cli_path: &'a Path) -> ProbeFuture<'a> {
        // Never called for a Remote provider — the engine-core control
        // plane skips the probe when `resolve()` returns no path. If a
        // future caller reaches here we report Authenticated because
        // Stage 0 uses the unconditional `test-token-for-{user}` dev
        // signer; Stage 1 will probe the JWT cache via lifegw instead.
        Box::pin(async { ProviderAuthState::Authenticated })
    }

    fn login_args(&self) -> Option<&'static [&'static str]> {
        // No CLI login flow — Stage 0 uses a dev token; Stage 1 will
        // mint a browser-driven JWT against lifegw.
        None
    }

    fn logout_args(&self) -> Option<&'static [&'static str]> {
        None
    }
}
