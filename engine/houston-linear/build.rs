//! Cynic schema registration for typed GraphQL queries/mutations.
//!
//! The vendored schema at `schema/linear.graphql` is pinned — refreshed
//! deliberately via `scripts/refresh-linear-schema.sh`, which produces
//! an explicit diff PR. Schema drift is then a code-review event, not
//! a silent break.
//!
//! Builds re-run whenever the schema changes (`cargo::rerun-if-changed`).

fn main() {
    cynic_codegen::register_schema("linear")
        .from_sdl_file("schema/linear.graphql")
        .expect("vendored Linear GraphQL schema must parse — refresh via scripts/refresh-linear-schema.sh")
        .as_default()
        .expect("register linear as the default schema for cynic queries in this crate");

    println!("cargo::rerun-if-changed=schema/linear.graphql");
    println!("cargo::rerun-if-changed=build.rs");
}
