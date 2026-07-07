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
        })
        .unwrap();
        assert!(json.contains("\"ready\":true"));
        assert!(json.contains("\"modelId\":\"ggml-small-q5_1\""));
        assert!(json.contains("\"sizeBytes\":42"));
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
