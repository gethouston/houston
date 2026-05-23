//! Typed GraphQL queries against Linear's schema.
//!
//! Codegen target is `engine/houston-linear/schema/linear.graphql`
//! (vendored; refresh via `scripts/refresh-linear-schema.sh`).
//!
//! Each query module corresponds to a Linear resource family.
//! Paginated queries use explicit `first: N` to bound complexity
//! consumption (default 50).

pub mod viewer;

#[cynic::schema("linear")]
pub mod schema {}
