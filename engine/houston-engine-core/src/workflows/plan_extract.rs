//! Extract workflow plan JSON from planner model text.

/// Pull a JSON object out of a planner model response (raw JSON, fenced block, or prose prefix).
pub fn extract_plan_json(raw: &str) -> Option<&str> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }

    if let Some(fenced) = strip_fenced_block(trimmed) {
        if let Some(json) = extract_plan_json(fenced) {
            return Some(json);
        }
    }

    if let Some(start) = trimmed.find("{\"steps\"") {
        return extract_balanced_object(&trimmed[start..]);
    }
    if let Some(start) = trimmed.find("{ \"steps\"") {
        return extract_balanced_object(&trimmed[start..]);
    }

    let start = trimmed.find('{')?;
    extract_balanced_object(&trimmed[start..])
}

fn strip_fenced_block(raw: &str) -> Option<&str> {
    let open = raw.find("```")?;
    let rest = &raw[open + 3..];
    let rest = rest
        .strip_prefix("json")
        .or_else(|| rest.strip_prefix("JSON"))
        .unwrap_or(rest);
    let rest = rest.trim_start();
    let close = rest.find("```")?;
    Some(rest[..close].trim())
}

fn extract_balanced_object(raw: &str) -> Option<&str> {
    let mut depth = 0usize;
    let mut in_string = false;
    let mut escape = false;
    for (i, ch) in raw.char_indices() {
        if in_string {
            if escape {
                escape = false;
                continue;
            }
            if ch == '\\' {
                escape = true;
                continue;
            }
            if ch == '"' {
                in_string = false;
            }
            continue;
        }
        match ch {
            '"' => in_string = true,
            '{' => {
                depth += 1;
            }
            '}' => {
                if depth == 0 {
                    return None;
                }
                depth -= 1;
                if depth == 0 {
                    return Some(&raw[..=i]);
                }
            }
            _ => {}
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_json_after_prose() {
        let raw = r#"Sure — here is the plan:
{"steps":[{"id":"a","task":"research"}]}"#;
        let json = extract_plan_json(raw).unwrap();
        assert!(json.contains("\"steps\""));
    }

    #[test]
    fn extracts_fenced_json() {
        let raw = "```json\n{\"steps\":[{\"id\":\"a\",\"task\":\"x\"}]}\n```";
        let json = extract_plan_json(raw).unwrap();
        assert_eq!(json, r#"{"steps":[{"id":"a","task":"x"}]}"#);
    }

    #[test]
    fn rejects_empty() {
        assert!(extract_plan_json("   ").is_none());
    }
}
