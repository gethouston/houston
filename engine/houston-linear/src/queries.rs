//! Typed GraphQL queries against Linear's schema.
//!
//! Codegen target is `engine/houston-linear/schema/linear.graphql`
//! (vendored; refresh via `scripts/refresh-linear-schema.sh`).
//!
//! Each query module corresponds to a Linear resource family.
//! Paginated queries use explicit `first: N` to bound complexity
//! consumption (default 50).

#[cynic::schema("linear")]
pub mod schema {}

// ── Custom-scalar wrappers ───────────────────────────────────────
//
// cynic requires every GraphQL scalar to map to a unique Rust type
// (so the `IsScalar<SchemaMarker>` trait bounds disambiguate). Linear's
// custom scalars all serialize as JSON strings on the wire; each
// wrapper is a transparent newtype + `cynic::impl_scalar!` registration
// that points the wrapper at its schema-generated marker type. Living
// in this module (next to the `schema` block they reference) keeps
// macro path resolution simple.

use serde::{Deserialize, Serialize};

/// ISO 8601 timestamp string.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(transparent)]
pub struct DateTime(pub String);

cynic::impl_scalar!(DateTime, schema::DateTime);

/// ISO 8601 timestamp OR ISO 8601 duration. Linear accepts both in
/// date filter inputs; we only ever pass the absolute form so the
/// underlying type stays plain String.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(transparent)]
pub struct DateTimeOrDuration(pub String);

cynic::impl_scalar!(DateTimeOrDuration, schema::DateTimeOrDuration);

/// Arbitrary JSON object — Linear's `JSONObject` scalar. The
/// `AgentActivityCreateInput.content` field is intentionally
/// schema-free so each activity type (thought / action / response /
/// elicitation / error / prompt) can carry its own shape; we round-trip
/// it as raw [`serde_json::Value`] under a transparent newtype so each
/// scalar gets a distinct Rust type for `IsScalar<SchemaMarker>`.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(transparent)]
pub struct JsonObject(pub serde_json::Value);

cynic::impl_scalar!(JsonObject, schema::JSONObject);

pub mod issues;
pub mod viewer;
