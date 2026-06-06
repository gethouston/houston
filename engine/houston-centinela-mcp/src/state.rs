//! Per-process server state: the salvoconducto plus the live session the gate
//! reads on every call. One MCP server process backs one agent session, so the
//! taint and Rule-of-Two flags accumulate exactly as the session unfolds.

use houston_centinela::{Capabilities, Session};
use std::path::PathBuf;

pub struct ServerState {
    /// The agent's declared, signed-off capabilities. Static for the session.
    pub caps: Capabilities,
    /// Live risk state, mutated as the session reads untrusted data, touches
    /// sensitive sources, or sends to the outside world.
    pub session: Session,
    /// Has any untrusted content entered this session yet? Once true, later
    /// egress calls carry tainted inputs.
    pub tainted: bool,
    /// Set once the client completes the MCP `initialize` handshake.
    pub initialized: bool,
    /// Where to append the live decision journal, if configured. The
    /// Salvoconducto UI tails this file. `None` disables journaling (tests).
    pub log_path: Option<PathBuf>,
}

impl ServerState {
    /// Build state for a session. `duress` arms the lockdown latch up front,
    /// modelling the user having typed the panic word before the agent ran.
    pub fn new(caps: Capabilities, duress: bool) -> Self {
        Self {
            caps,
            session: Session {
                duress_active: duress,
                ..Default::default()
            },
            tainted: false,
            initialized: false,
            log_path: None,
        }
    }

    /// Point the live decision journal at `path`. Chainable from `new`.
    pub fn with_log(mut self, path: Option<PathBuf>) -> Self {
        self.log_path = path;
        self
    }
}
