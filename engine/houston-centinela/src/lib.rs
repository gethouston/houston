//! Centinela: a deterministic capability firewall for Houston agents.
//!
//! The LLM is not a security boundary. It is a confused deputy: it cannot
//! reliably tell instructions from data and is always persuadable. Centinela
//! moves the trust decision out of the prompt and into code that the model
//! cannot bypass, no matter how convincing the input.
//!
//! This crate is the Policy Core: pure logic, no async, no IO beyond reading a
//! capabilities file, no Tauri, no React. Everything funnels through
//! [`evaluate`], which returns a [`Decision`] of `Allow | Deny | StepUp`.
//!
//! The wiring (an MCP gateway in front of the agent's tools) lives elsewhere;
//! it only ever calls [`evaluate`]. Keeping the brain pure is what makes it
//! trivially testable and impossible for a prompt to talk around.

mod capabilities;
mod decision;
mod evaluate;
pub mod secrets;
mod session;
mod tool_call;

pub use capabilities::{Capabilities, CentinelaError, Duress, RuleOfTwo, Scopes};
pub use decision::{Decision, Reason};
pub use evaluate::evaluate;
pub use secrets::SecretKind;
pub use session::Session;
pub use tool_call::ToolCall;
