//! houston-beltic — Beltic verifiable-credentials integration for Houston.
//!
//! Wraps Beltic's Credentials API: issuance, revocation, local JWT-VC
//! verification (JWKS + Status List 2021), and webhook signature
//! verification (`Beltic-Signature` Stripe-pattern). Transport-neutral —
//! no Tauri, no React, no axum. Routes that surface this crate live in
//! `houston-engine-server::routes::credentials` (added in chunk 3).
//!
//! Module map:
//! - [`config`]            — runtime configuration; jwks/status URLs derive from `base_url`
//! - [`errors`]            — typed errors mapping Beltic's nested error envelope
//! - [`client`]            — reqwest HTTP client with `X-Api-Key` + retry hooks
//! - [`issuer`]            — typed issue/revoke methods for each credential_type
//! - [`webhook_verifier`]  — HMAC-SHA256 verification of webhook deliveries
//! - [`verifier`]          — local JWT-VC verify: JWKS cache, Status List, policy

pub mod client;
pub mod config;
pub mod did_jwk;
pub mod errors;
pub mod issuer;
pub mod verifier;
pub mod webhook_verifier;

pub use client::Client;
pub use config::Configuration;
pub use did_jwk::{mint as mint_did_jwk, MintedDidJwk};
pub use errors::{BelticError, BelticResult};
pub use issuer::Issuer;
pub use verifier::{Verifier, VerifyResult};
pub use webhook_verifier::WebhookVerifier;
