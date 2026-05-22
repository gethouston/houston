//! houston-events — Core event system for AI agent desktop apps.
//!
//! All inputs (messages, heartbeats, cron triggers, hooks, webhooks,
//! agent-to-agent messages) flow through a single ordered queue.
//! Handlers register by input type and receive dispatched events.

pub mod dispatcher;
pub mod handler;
pub mod queue;
pub mod types;

// Re-export key types for convenience.
pub use dispatcher::EventDispatcher;
pub use handler::{HandlerResponse, InputHandler};
pub use queue::{EventQueue, EventQueueHandle};
pub use types::{HookEvent, HoustonInput, InputSource, InputType};
