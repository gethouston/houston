//! A single tool invocation the agent is about to make, normalised into the
//! capability terms the gate reasons about.

/// One pending tool call. The gateway maps the raw MCP tool name and its
/// arguments into this shape before asking the gate for a verdict.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ToolCall {
    /// Resolved capability, e.g. `"bank:transfer"`. The gateway maps the raw
    /// MCP tool name to this before calling [`crate::evaluate`].
    pub capability: String,
    /// Does this call send data to the outside world?
    pub is_egress: bool,
    /// For egress calls, the destination host (already normalised from any URL).
    pub egress_dest: Option<String>,
    /// Do this call's arguments carry data from an untrusted source?
    pub inputs_tainted: bool,
    /// Does this call write into a sensitive sink (bank, private store)?
    pub sink_sensitive: bool,
}

impl ToolCall {
    /// A non-egress, untainted call for `capability`. Set the other fields as
    /// the gateway learns them.
    pub fn new(capability: impl Into<String>) -> Self {
        Self {
            capability: capability.into(),
            ..Default::default()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn new_sets_only_capability() {
        let call = ToolCall::new("bank:balance");
        assert_eq!(call.capability, "bank:balance");
        assert!(!call.is_egress);
        assert_eq!(call.egress_dest, None);
        assert!(!call.inputs_tainted);
        assert!(!call.sink_sensitive);
    }
}
