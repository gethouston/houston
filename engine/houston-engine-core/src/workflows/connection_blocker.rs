//! Structured connection blockers emitted by automated workflow steps.

use crate::workflows::types::WorkflowConnectionBlocker;

const MARKER_PREFIX: &str = "<!--houston:workflow-connection ";
const MARKER_SUFFIX: &str = "-->";

pub fn parse_connection_blocker(text: &str) -> Option<WorkflowConnectionBlocker> {
    let mut remaining = text;
    loop {
        let (_, after_prefix) = remaining.split_once(MARKER_PREFIX)?;
        let (payload, after_marker) = after_prefix.split_once(MARKER_SUFFIX)?;
        if let Some(blocker) = parse_payload(payload.trim()) {
            return Some(blocker);
        }
        remaining = after_marker;
    }
}

fn parse_payload(payload: &str) -> Option<WorkflowConnectionBlocker> {
    let mut blocker = serde_json::from_str::<WorkflowConnectionBlocker>(payload).ok()?;
    if let WorkflowConnectionBlocker::ComposioToolkit { toolkit } = &mut blocker {
        *toolkit = toolkit.trim().to_lowercase();
        if toolkit.is_empty() {
            return None;
        }
    }
    Some(blocker)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_signin_blocker() {
        assert_eq!(
            parse_connection_blocker(
                r#"<!--houston:workflow-connection {"type":"composio_signin"}-->"#
            ),
            Some(WorkflowConnectionBlocker::ComposioSignin)
        );
    }

    #[test]
    fn parses_and_normalizes_toolkit_blocker() {
        assert_eq!(
            parse_connection_blocker(
                r#"<!--houston:workflow-connection {"type":"composio_toolkit","toolkit":" Gmail "}-->"#
            ),
            Some(WorkflowConnectionBlocker::ComposioToolkit {
                toolkit: "gmail".into()
            })
        );
    }

    #[test]
    fn ignores_invalid_markers() {
        assert_eq!(
            parse_connection_blocker(
                r#"<!--houston:workflow-connection {"type":"composio_toolkit","toolkit":""}-->"#
            ),
            None
        );
        assert_eq!(
            parse_connection_blocker(r#"<!--houston:workflow-connection {"type":"unknown"}-->"#),
            None
        );
        assert_eq!(
            parse_connection_blocker("<!--houston:workflow-connection {bad}-->"),
            None
        );
    }

    #[test]
    fn finds_valid_marker_after_invalid_marker() {
        assert_eq!(
            parse_connection_blocker(
                r#"<!--houston:workflow-connection {bad}-->
<!--houston:workflow-connection {"type":"composio_signin"}-->"#
            ),
            Some(WorkflowConnectionBlocker::ComposioSignin)
        );
    }
}
