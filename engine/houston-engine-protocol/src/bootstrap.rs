//! Wire types for cloud agent bootstrap export.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Full payload the local engine exports before cloud agent creation.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AgentBootstrapBundle {
    pub config_id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    pub claude_md: String,
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub seeds: HashMap<String, String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub skills: Vec<BootstrapSkill>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub config_patch: Option<BootstrapConfigPatch>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source: Option<BootstrapSource>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BootstrapSkill {
    pub slug: String,
    pub skill_md: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub struct BootstrapConfigPatch {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub effort: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BootstrapSource {
    pub kind: String,
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
}

/// Request to assemble a bootstrap bundle without writing an agent to disk.
#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BuildBootstrapBundleRequest {
    pub config_id: String,
    pub name: String,
    #[serde(default)]
    pub color: Option<String>,
    #[serde(default)]
    pub claude_md: Option<String>,
    #[serde(default)]
    pub installed_path: Option<String>,
    #[serde(default)]
    pub seeds: Option<HashMap<String, String>>,
    #[serde(default)]
    pub provider: Option<String>,
    #[serde(default)]
    pub model: Option<String>,
    #[serde(default)]
    pub effort: Option<String>,
    /// When set, read from an existing local agent instead of a Store template.
    #[serde(default)]
    pub agent_path: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bundle_serializes_camel_case() {
        let bundle = AgentBootstrapBundle {
            config_id: "demo".into(),
            name: "Ops".into(),
            color: Some("navy".into()),
            claude_md: "## Demo".into(),
            seeds: HashMap::new(),
            skills: vec![BootstrapSkill {
                slug: "demo".into(),
                skill_md: "body".into(),
            }],
            config_patch: Some(BootstrapConfigPatch {
                provider: Some("anthropic".into()),
                model: Some("sonnet".into()),
                effort: None,
            }),
            source: Some(BootstrapSource {
                kind: "houston-store".into(),
                id: "demo".into(),
                version: Some("1.0.0".into()),
            }),
        };
        let json = serde_json::to_value(&bundle).unwrap();
        assert_eq!(json["configId"], "demo");
        assert_eq!(json["claudeMd"], "## Demo");
        assert_eq!(json["skills"][0]["skillMd"], "body");
        assert_eq!(json["configPatch"]["provider"], "anthropic");
        assert_eq!(json["source"]["kind"], "houston-store");
    }

    #[test]
    fn request_deserializes_camel_case() {
        let req: BuildBootstrapBundleRequest = serde_json::from_str(
            r#"{
              "configId": "demo",
              "name": "Ops",
              "installedPath": "/tmp/agents/demo",
              "provider": "openai",
              "model": "gpt-5"
            }"#,
        )
        .unwrap();
        assert_eq!(req.config_id, "demo");
        assert_eq!(req.installed_path.as_deref(), Some("/tmp/agents/demo"));
        assert_eq!(req.provider.as_deref(), Some("openai"));
    }
}
