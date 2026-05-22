use crate::types::{HoustonInput, InputType};

/// Result of handling an input.
#[derive(Debug)]
pub enum HandlerResponse {
    /// Input was processed successfully.
    Processed,
    /// Input was suppressed (e.g., heartbeat "all clear" response).
    Suppressed,
    /// Input should be forwarded to another handler or agent.
    Forward {
        to: String,
        payload: serde_json::Value,
    },
    /// Handler encountered an error.
    Error(String),
}

/// Trait for handling inputs from the event queue.
///
/// Implement this for each kind of processor (message handler, heartbeat
/// handler, webhook handler, etc.).
#[async_trait::async_trait]
pub trait InputHandler: Send + Sync {
    /// Process a single input, returning the outcome.
    async fn handle(&self, input: &HoustonInput) -> anyhow::Result<HandlerResponse>;

    /// Return true if this handler should receive the given input type.
    fn handles(&self, input_type: &InputType) -> bool;
}
