//! Run NVIDIA SkillSpector against a skill directory and parse its risk
//! assessment into typed Rust.
//!
//! SkillSpector ships bundled inside the Houston app as a relocatable
//! Python interpreter (see `houston-cli-bundle::bundled_skillspector_python`
//! and `knowledge-base/skill-inspector.md`). We always run it in static
//! mode (`--no-llm`): keyless, and for plain `SKILL.md` skills (which carry
//! no dependency manifest) network-free. SkillSpector reports a 0-100 risk
//! score, a `Severity`, and a `Recommendation` of SAFE / CAUTION /
//! DO_NOT_INSTALL — the last drives Houston's gate-with-override install
//! flow.
//!
//! Per Houston's "no silent failures" rule every error here is a typed
//! variant the caller MUST surface; we never swallow a failed scan into a
//! fake "safe" result.

use std::path::Path;
use std::process::Stdio;
use std::time::Duration;

use serde::{Deserialize, Serialize};

/// How long to wait for a single scan before giving up. A `SKILL.md` scan
/// runs in ~1-3s; the generous ceiling covers the one optional network
/// call SkillSpector can make (a ~10s OSV lookup, only when a skill carries
/// a dependency manifest) without ever hanging the install flow.
const SCAN_TIMEOUT: Duration = Duration::from_secs(90);

/// Severity of a single finding, mirroring SkillSpector's `Severity` enum.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum Severity {
    Low,
    Medium,
    High,
    Critical,
}

/// SkillSpector's overall install recommendation. Serialized tokens are
/// `SAFE` / `CAUTION` / `DO_NOT_INSTALL` (underscores), matching the CLI's
/// JSON exactly.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum Recommendation {
    Safe,
    Caution,
    DoNotInstall,
}

impl Recommendation {
    /// True when SkillSpector advises against installing (maps from
    /// HIGH/CRITICAL severity). Houston gates the install on this — the
    /// user can still override, but only after seeing the warning.
    pub fn is_blocking(self) -> bool {
        matches!(self, Recommendation::DoNotInstall)
    }
}

/// The overall risk verdict for a scanned skill.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RiskAssessment {
    /// 0-100, clamped by SkillSpector.
    pub score: u16,
    pub severity: Severity,
    pub recommendation: Recommendation,
}

/// Where in the skill a finding was located. Every field is optional —
/// SkillSpector leaves `end_line` null for single-line hits.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct IssueLocation {
    #[serde(default)]
    pub file: Option<String>,
    #[serde(default)]
    pub start_line: Option<u32>,
    #[serde(default)]
    pub end_line: Option<u32>,
}

/// A single finding. We deliberately drop SkillSpector's `code_snippet`
/// and `intent` fields when deserializing: Houston never shows raw code or
/// model-guessed intent to its non-technical users (serde ignores them).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Issue {
    /// Rule id, e.g. `PE3`, `P1`, `SC2`, `TM2`.
    pub id: String,
    pub category: String,
    #[serde(default)]
    pub pattern: Option<String>,
    pub severity: Severity,
    #[serde(default)]
    pub confidence: Option<f64>,
    #[serde(default)]
    pub location: Option<IssueLocation>,
    #[serde(default)]
    pub finding: Option<String>,
    #[serde(default)]
    pub explanation: Option<String>,
    #[serde(default)]
    pub remediation: Option<String>,
}

/// Metadata SkillSpector attaches to every scan.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ScanMetadata {
    #[serde(default)]
    pub skillspector_version: Option<String>,
    #[serde(default)]
    pub has_executable_scripts: bool,
}

/// The parsed result of a single scan. Unknown SkillSpector top-level
/// fields (`skill`, `components`, ...) are ignored by serde.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanReport {
    pub risk_assessment: RiskAssessment,
    #[serde(default)]
    pub issues: Vec<Issue>,
    #[serde(default)]
    pub metadata: ScanMetadata,
}

impl ScanReport {
    pub fn severity(&self) -> Severity {
        self.risk_assessment.severity
    }
    pub fn recommendation(&self) -> Recommendation {
        self.risk_assessment.recommendation
    }
    pub fn score(&self) -> u16 {
        self.risk_assessment.score
    }
}

/// Error from running or reading a scan. Each variant is phrased for the
/// non-technical user and carries enough detail for a bug report.
#[derive(Debug, thiserror::Error)]
pub enum InspectorError {
    #[error("the skill safety check isn't available on this device")]
    Unavailable,
    #[error("couldn't start the skill safety check: {0}")]
    Spawn(String),
    #[error("the skill safety check took too long and was stopped")]
    Timeout,
    #[error("the skill safety check ended unexpectedly: {0}")]
    Failed(String),
    #[error("couldn't read the skill safety check result: {0}")]
    BadOutput(String),
}

/// Bootstrap that runs SkillSpector by importing its CLI app rather than via
/// the installed console-script launcher, so the relocated bundle works on
/// every OS. See `houston_cli_bundle::bundled_skillspector_python`.
const SKILLSPECTOR_BOOTSTRAP: &str = "from skillspector.cli import app; app()";

/// Whether SkillSpector is bundled + resolvable on this platform. The scan
/// feature is opt-out-safe: when this is `false` (e.g. a device the scanner
/// isn't bundled for), callers proceed without a pre-install scan rather
/// than erroring.
pub fn is_available() -> bool {
    houston_cli_bundle::bundled_skillspector_python().is_some()
}

/// Scan a directory that contains a `SKILL.md`. Returns the typed report
/// when the scan ran (whether or not it found issues), or an
/// `InspectorError` the caller MUST surface.
pub async fn scan_skill_dir(skill_dir: &Path) -> Result<ScanReport, InspectorError> {
    let python = houston_cli_bundle::bundled_skillspector_python()
        .ok_or(InspectorError::Unavailable)?;
    run_scan(&python, skill_dir).await
}

async fn run_scan(python: &Path, skill_dir: &Path) -> Result<ScanReport, InspectorError> {
    let mut cmd = tokio::process::Command::new(python);
    cmd.arg("-c")
        .arg(SKILLSPECTOR_BOOTSTRAP)
        .arg("scan")
        .arg(skill_dir)
        .arg("--no-llm")
        .arg("--format")
        .arg("json")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        // If the scan times out we must not leave an orphaned interpreter.
        .kill_on_drop(true)
        // Keep the scan deterministic + offline: never let an inherited
        // provider key push SkillSpector toward an LLM call.
        .env_remove("ANTHROPIC_API_KEY")
        .env_remove("OPENAI_API_KEY")
        .env_remove("NVIDIA_INFERENCE_KEY")
        .env_remove("SKILLSPECTOR_PROVIDER");

    let child = cmd.spawn().map_err(|e| InspectorError::Spawn(e.to_string()))?;

    let output = match tokio::time::timeout(SCAN_TIMEOUT, child.wait_with_output()).await {
        Ok(Ok(o)) => o,
        Ok(Err(e)) => return Err(InspectorError::Spawn(e.to_string())),
        Err(_) => return Err(InspectorError::Timeout),
    };

    // SkillSpector exits 0 (clean) or 1 (findings present); both mean the
    // scan ran to completion. Any other code is a real failure we surface.
    let code = output.status.code();
    if !matches!(code, Some(0) | Some(1)) {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let mut tail: Vec<&str> = stderr.lines().rev().take(4).collect();
        tail.reverse();
        return Err(InspectorError::Failed(format!(
            "exit {}: {}",
            code.map(|c| c.to_string())
                .unwrap_or_else(|| "terminated by signal".into()),
            tail.join(" ").trim()
        )));
    }

    parse_report(&output.stdout).map_err(|e| InspectorError::BadOutput(e.to_string()))
}

/// Parse SkillSpector's `--format json` stdout into a [`ScanReport`].
fn parse_report(stdout: &[u8]) -> Result<ScanReport, serde_json::Error> {
    serde_json::from_slice(stdout)
}

#[cfg(test)]
mod tests {
    use super::*;

    // Real captured SkillSpector v2.1.5 `--no-llm --format json` output
    // (local paths scrubbed). Real fixtures beat hand-guessed shapes.
    const RISKY: &[u8] = include_bytes!("../tests/fixtures/risky.json");
    const CLEAN: &[u8] = include_bytes!("../tests/fixtures/clean.json");

    #[test]
    fn parses_clean_report() {
        let r = parse_report(CLEAN).expect("clean parses");
        assert_eq!(r.score(), 0);
        assert_eq!(r.severity(), Severity::Low);
        assert_eq!(r.recommendation(), Recommendation::Safe);
        assert!(!r.recommendation().is_blocking());
        assert!(r.issues.is_empty());
        assert_eq!(r.metadata.skillspector_version.as_deref(), Some("2.1.5"));
    }

    #[test]
    fn parses_risky_report() {
        let r = parse_report(RISKY).expect("risky parses");
        assert_eq!(r.score(), 100);
        assert_eq!(r.severity(), Severity::Critical);
        assert_eq!(r.recommendation(), Recommendation::DoNotInstall);
        assert!(r.recommendation().is_blocking());
        assert!(r.issues.len() >= 4, "expected several findings");
        // A credential-access finding parsed with its enum severity + location.
        let pe3 = r.issues.iter().find(|i| i.id == "PE3").expect("PE3 present");
        assert_eq!(pe3.severity, Severity::High);
        assert_eq!(pe3.category, "Privilege Escalation");
        assert!(pe3.location.as_ref().and_then(|l| l.start_line).is_some());
    }

    #[test]
    fn severity_and_recommendation_serde_tokens() {
        // The wire tokens must match SkillSpector verbatim, including the
        // underscores in DO_NOT_INSTALL.
        assert_eq!(
            serde_json::to_string(&Recommendation::DoNotInstall).unwrap(),
            "\"DO_NOT_INSTALL\""
        );
        assert_eq!(
            serde_json::to_string(&Recommendation::Safe).unwrap(),
            "\"SAFE\""
        );
        assert_eq!(
            serde_json::from_str::<Severity>("\"CRITICAL\"").unwrap(),
            Severity::Critical
        );
    }

    #[test]
    fn garbage_output_is_bad_output_not_a_panic() {
        assert!(parse_report(b"not json at all").is_err());
        assert!(parse_report(b"").is_err());
    }
}
