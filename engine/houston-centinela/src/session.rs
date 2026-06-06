//! Live, per-session risk state the gate reads on every tool call.

/// The three Rule-of-Two properties plus the duress latch, tracked for the
/// lifetime of an agent session. The gateway flips these as the session
/// processes untrusted input, touches sensitive data, prepares an external
/// action, or arms duress. The gate never writes them; it only reads.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Session {
    /// Has this session read content from an untrusted source (web, email)?
    pub untrusted_input: bool,
    /// Has this session accessed sensitive data (bank, private files)?
    pub sensitive_data: bool,
    /// Is this session about to act on or communicate with the outside world?
    pub external_action: bool,
    /// Is the duress latch armed? When true the session is in read-only
    /// lockdown and every sensitive capability is denied.
    pub duress_active: bool,
    /// Content inspection toggle. When on, outbound payloads are scanned for
    /// secrets (API keys, private keys, cards, passwords) even when the
    /// capability is permitted: a leak is blocked, not just a forbidden action.
    pub inspect_content: bool,
}

impl Session {
    /// A fresh session with no risk properties set and duress disarmed.
    pub fn new() -> Self {
        Self::default()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fresh_session_is_clean() {
        let s = Session::new();
        assert!(!s.untrusted_input);
        assert!(!s.sensitive_data);
        assert!(!s.external_action);
        assert!(!s.duress_active);
    }
}
