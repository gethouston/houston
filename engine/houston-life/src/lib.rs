//! `houston-life` — Rust client to the Life Runtime (`lifed` / `lifegw`).
//!
//! Stage 0 (this crate's slice): connect to a locally-running `lifed`
//! daemon over a Unix Domain Socket and call the four public-plane
//! services — `life.v1.{Agent, Events, Wallet, Identity}`. Auth is the
//! `Bearer dev-token-for-{user_id}` shortcut (`lifed` config:
//! `auth.dev_signer_enabled = true`).
//!
//! Stage 1 will add a gRPC-Web + JWS path against `lifegw` (HTTPS, Tier-1
//! JWT) using the same generated proto types.

pub mod client;
pub mod error;

/// Generated protobuf types for `life.v1.*` + `aios.v1.*`.
///
/// `tonic-build` emits each `.proto` package as a top-level Rust module
/// named after the package's last segment. We re-export them under the
/// matching nested paths so downstream code can refer to types via
/// `houston_life::proto::life::v1::CreateSessionReq` etc.
pub mod proto {
    pub mod aios {
        pub mod v1 {
            tonic::include_proto!("aios.v1");
        }
    }
    pub mod life {
        pub mod v1 {
            tonic::include_proto!("life.v1");
        }
    }
}

pub use client::LifeClient;
pub use error::{LifeError, LifeResult};
