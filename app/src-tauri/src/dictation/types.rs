//! Wire types shared by the dictation commands. The frontend binds against
//! these exact shapes, so the field names / casing are load-bearing.

/// Whether the pinned dictation model is present on disk, reported by
/// [`super::dictation_model_status`].
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DictationModelStatus {
    pub ready: bool,
    pub model_id: String,
    pub size_bytes: u64,
    /// False when this machine's CPU cannot execute the bundled whisper-cli
    /// (pre-AVX2 x86-64 on Windows/Linux — see [`super::cpu`]). The frontend
    /// then explains instead of offering the model download.
    pub cpu_supported: bool,
}

/// What `transcribe_audio` rejects with. Untagged: a `Message` crosses the
/// IPC as the plain string the frontend already matches on (the sentinels
/// `"model-not-ready"` / `"dictation-unsupported-cpu"` and every setup error),
/// while a `SidecarFailure` is an object carrying whisper-cli's stderr tail so
/// the Sentry report for a crash names the crash site (PRODUCT-1731). The
/// `message` of a `SidecarFailure` keeps the exact pre-existing wording so the
/// Sentry issue for each exit flavor stays continuous.
#[derive(Debug, serde::Serialize)]
#[serde(untagged)]
pub enum DictationError {
    Message(String),
    #[serde(rename_all = "camelCase")]
    SidecarFailure {
        kind: SidecarFailureKind,
        message: String,
        stderr_tail: String,
    },
}

/// Discriminator the frontend narrows a `SidecarFailure` on.
#[derive(Debug, Clone, Copy, serde::Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum SidecarFailureKind {
    SidecarFailure,
}

impl From<String> for DictationError {
    fn from(message: String) -> Self {
        Self::Message(message)
    }
}

impl From<&str> for DictationError {
    fn from(message: &str) -> Self {
        Self::Message(message.to_string())
    }
}

impl DictationError {
    pub fn sidecar(message: impl Into<String>, stderr_tail: impl Into<String>) -> Self {
        Self::SidecarFailure {
            kind: SidecarFailureKind::SidecarFailure,
            message: message.into(),
            stderr_tail: stderr_tail.into(),
        }
    }
}

/// A single progress tick emitted on the `dictation-model-progress` channel
/// while [`super::download_dictation_model`] runs.
#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelProgress {
    pub received: u64,
    pub total: u64,
    pub phase: ModelProgressPhase,
}

/// The stage a download is in. `Error` accompanies a returned `Err` (the beta
/// no-silent-failure policy: the user sees both the toast and the failed tick).
#[derive(Clone, Copy, serde::Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ModelProgressPhase {
    Downloading,
    Verifying,
    Done,
    Error,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn status_serializes_camel_case() {
        let json = serde_json::to_string(&DictationModelStatus {
            ready: true,
            model_id: "ggml-small-q5_1".to_string(),
            size_bytes: 42,
            cpu_supported: true,
        })
        .unwrap();
        assert!(json.contains("\"ready\":true"));
        assert!(json.contains("\"modelId\":\"ggml-small-q5_1\""));
        assert!(json.contains("\"sizeBytes\":42"));
        assert!(json.contains("\"cpuSupported\":true"));
    }

    #[test]
    fn message_error_serializes_as_a_bare_string() {
        let json = serde_json::to_string(&DictationError::from("model-not-ready")).unwrap();
        assert_eq!(json, "\"model-not-ready\"");
    }

    #[test]
    fn sidecar_failure_serializes_with_kind_and_camel_case_tail() {
        let err = DictationError::sidecar(
            "dictation: whisper exited with exit code: 0xc0000409",
            "ggml.c:1: GGML_ASSERT(x) failed",
        );
        let json: serde_json::Value = serde_json::to_value(&err).unwrap();
        assert_eq!(json["kind"], "sidecar-failure");
        assert_eq!(
            json["message"],
            "dictation: whisper exited with exit code: 0xc0000409"
        );
        assert_eq!(json["stderrTail"], "ggml.c:1: GGML_ASSERT(x) failed");
    }

    #[test]
    fn progress_phase_serializes_lowercase() {
        let json = serde_json::to_string(&ModelProgress {
            received: 1,
            total: 2,
            phase: ModelProgressPhase::Downloading,
        })
        .unwrap();
        assert!(json.contains("\"received\":1"));
        assert!(json.contains("\"total\":2"));
        assert!(json.contains("\"phase\":\"downloading\""));
        assert!(serde_json::to_string(&ModelProgressPhase::Error)
            .unwrap()
            .contains("error"));
    }
}
