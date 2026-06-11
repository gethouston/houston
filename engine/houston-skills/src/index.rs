//! Skills index builder for system prompt injection.

use crate::format;
use crate::SkillSummary;
use std::path::Path;

/// Build a compact skills index string for system prompt injection.
/// Format:
/// ```text
/// SKILLS (3 available -- read a skill's SKILL.md for the full procedure)
/// * docker-deploy -- Deploy services via Docker Compose... (v3, used 2026-04-04)
/// ```
///
/// Sorted by last_used (most recent first), then alphabetically.
pub fn build(skills_dir: &Path) -> Result<String, crate::SkillError> {
    let mut summaries = list_summaries(skills_dir)?;
    if summaries.is_empty() {
        return Ok("SKILLS (0 available)".to_string());
    }

    // Sort: most recently used first, then alphabetical
    summaries.sort_by(|a, b| {
        let a_date = a.last_used.as_deref().unwrap_or("");
        let b_date = b.last_used.as_deref().unwrap_or("");
        b_date.cmp(a_date).then_with(|| a.name.cmp(&b.name))
    });

    let count = summaries.len();
    let mut lines = Vec::with_capacity(count + 1);
    lines.push(format!(
        "SKILLS ({count} available -- read a skill's SKILL.md for the full procedure)"
    ));

    for s in &summaries {
        let version_part = format!("v{}", s.version);
        let used_part = s
            .last_used
            .as_deref()
            .map(|d| format!(", used {d}"))
            .unwrap_or_default();
        lines.push(format!(
            "  * {} -- {} ({version_part}{used_part})",
            s.name, s.description
        ));
    }

    Ok(lines.join("\n"))
}

/// List summaries from all skill directories.
fn list_summaries(skills_dir: &Path) -> Result<Vec<SkillSummary>, crate::SkillError> {
    if !skills_dir.exists() {
        return Ok(Vec::new());
    }
    let entries =
        std::fs::read_dir(skills_dir).map_err(|e| crate::SkillError::Io(e.to_string()))?;

    let mut summaries = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let skill_md = path.join("SKILL.md");
        if !skill_md.exists() {
            continue;
        }
        match format::parse_file(&skill_md) {
            Ok((mut summary, _body)) => {
                // Identity = directory slug, matching `list_skills` and what
                // `load_skill` resolves by. Keeps the system-prompt index in
                // step even when frontmatter `name:` drifted. (HOU-441)
                if let Some(dir_name) = path.file_name().and_then(|n| n.to_str()) {
                    summary.name = dir_name.to_string();
                }
                summaries.push(summary);
            }
            Err(e) => tracing::warn!("[houston-skills] skipping {}: {e}", path.display()),
        }
    }
    Ok(summaries)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::create_skill;
    use tempfile::TempDir;

    #[test]
    fn empty_dir() {
        let tmp = TempDir::new().unwrap();
        let result = build(tmp.path()).unwrap();
        assert_eq!(result, "SKILLS (0 available)");
    }

    #[test]
    fn index_with_skills() {
        let tmp = TempDir::new().unwrap();
        let dir = tmp.path();

        create_skill(
            dir,
            crate::CreateSkillInput {
                name: "beta-skill".into(),
                description: "Second skill".into(),
                content: "## Procedure\nDo beta".into(),
                tags: vec![],
            },
        )
        .unwrap();

        create_skill(
            dir,
            crate::CreateSkillInput {
                name: "alpha-skill".into(),
                description: "First skill".into(),
                content: "## Procedure\nDo alpha".into(),
                tags: vec!["test".into()],
            },
        )
        .unwrap();

        let index = build(dir).unwrap();
        assert!(index.starts_with("SKILLS (2 available"));
        assert!(index.contains("alpha-skill"));
        assert!(index.contains("beta-skill"));
        // Both created today, so alphabetical order applies
        let alpha_pos = index.find("alpha-skill").unwrap();
        let beta_pos = index.find("beta-skill").unwrap();
        assert!(alpha_pos < beta_pos);
    }
}
