//! The live decision journal: one JSON line per verdict, appended to a file the
//! Salvoconducto UI tails. This is the "no silent failures" decision log made
//! visible to a non-technical user.

use houston_centinela::Decision;
use serde_json::json;
use std::io::Write;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

/// Append the gate's verdict for one call.
pub fn append(path: &Path, tool: &str, capability: &str, decision: &Decision) {
    let (kind, code, message) = match decision {
        Decision::Allow => ("allow", "ok", String::new()),
        Decision::Deny { reason } => ("deny", reason.code(), reason.to_string()),
        Decision::StepUp { reason } => ("step_up", reason.code(), reason.to_string()),
    };
    append_custom(path, tool, capability, kind, code, &message);
}

/// Append an arbitrary outcome record. Used for human-approval results, whose
/// `decision`/`code` are not gate verdicts (`approved`, `human_denied`,
/// `approval_timeout`).
pub fn append_custom(
    path: &Path,
    tool: &str,
    capability: &str,
    decision: &str,
    code: &str,
    message: &str,
) {
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let record = json!({
        "ts": ts,
        "tool": tool,
        "capability": capability,
        "decision": decision,
        "code": code,
        "message": message,
    });
    // Best-effort journal for the live UI. A failure here is surfaced on stderr,
    // never swallowed, and never blocks the gate (the verdict already stands).
    let written = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .and_then(|mut f| writeln!(f, "{record}"));
    if let Err(e) = written {
        eprintln!(
            "[centinela] no se pudo escribir el journal {}: {e}",
            path.display()
        );
    }
}
