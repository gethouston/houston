//! Heuristics for detecting approval-gated steps that did not act.

/// True when an approval-required step likely re-asked instead of acting.
pub fn step_reapproval_only(response: &str) -> bool {
    let trimmed = response.trim();
    if trimmed.is_empty() {
        return true;
    }
    if has_action_evidence(trimmed) {
        return false;
    }
    has_reapproval_phrasing(trimmed)
}

fn has_action_evidence(text: &str) -> bool {
    let lower = text.to_ascii_lowercase();
    if lower.contains("http://") || lower.contains("https://") {
        return true;
    }
    const MARKERS: &[&str] = &[
        "created ",
        "uploaded ",
        "sent ",
        "posted ",
        "scheduled ",
        "deleted ",
        "updated ",
        "document id",
        "file id",
        "spreadsheet id",
        "presentation id",
        "message id",
        "docs.google.com",
        "drive.google.com",
        "slides.google.com",
    ];
    MARKERS.iter().any(|m| lower.contains(m))
}

fn has_reapproval_phrasing(text: &str) -> bool {
    let lower = text.to_ascii_lowercase();
    const PHRASES: &[&str] = &[
        "approve",
        "approval",
        "permission",
        "confirm before",
        "before i proceed",
        "before proceeding",
        "shall i",
        "would you like",
        "do you want me to",
        "need your",
        "waiting for",
        "pending approval",
        "ask before",
    ];
    PHRASES.iter().any(|p| lower.contains(p))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reapproval_only_text_is_flagged() {
        assert!(step_reapproval_only(
            "I need your approval before I create the Google Doc. Shall I proceed?"
        ));
    }

    #[test]
    fn action_response_is_not_flagged() {
        assert!(!step_reapproval_only(
            "Created Google Doc \"Competitor Brief\" at https://docs.google.com/document/d/abc123"
        ));
    }

    #[test]
    fn empty_response_is_flagged() {
        assert!(step_reapproval_only(""));
    }
}
