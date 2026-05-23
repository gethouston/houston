//! Polling reconciliation — backstop for missed webhook deliveries.
//!
//! Linear webhooks are at-least-once with retry policy +1m/+1h/+6h
//! then auto-disable. The engine cannot rely on webhook delivery
//! alone; polling reconciliation closes the gap.
//!
//! ## Cursor model
//!
//! `.houston/trackers/linear/sync_state.json` holds the per-resource
//! cursor (latest seen `updatedAt`). Each reconcile run queries
//! `issues(filter: { updatedAt: { gt: $cursor } }, orderBy: updatedAt,
//! first: 50)` paginated until exhausted, advancing the cursor
//! monotonically.
//!
//! Cursors persist per resource type (initiatives, projects, cycles,
//! issues) since each updates independently. Capability-gated
//! resources (cycles, initiatives) are skipped when the provider does
//! not declare them.
//!
//! ## Cadence
//!
//! The engine scheduler ([`houston_scheduler`]) registers a
//! `tracker-reconcile` cron per connected workspace at a default
//! 60-second interval. Webhook-driven reconciles can also trigger ad
//! hoc when the relay surfaces a delivery the local ledger does not
//! recognize.
//!
//! ## Budget
//!
//! Polling consumes rate-limit budget. When the rolling window is
//! near exhaustion, the reconciler backs off exponentially and the
//! webhook stream remains the primary fresh-data path. See
//! [`crate::rate_limit`].
//!
//! Populated in C2 (skeleton) and C5 (full impl).
