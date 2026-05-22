use super::StoreListing;
use crate::error::{CoreError, CoreResult};
use crate::workspaces;
use serde::Deserialize;
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Deserialize)]
struct BundledCatalog {
    agents: Vec<StoreListing>,
}

/// One step in a bundled package's migration history. Captures the
/// renames (and removals, in the future) that happened between two
/// published versions of the same agent. Authors hand-write these in
/// `store/agents/<id>/.migrations.json` whenever a published release
/// renames or drops a packaged Action.
///
/// Example file:
/// ```json
/// [
///   {
///     "from": "0.1.4",
///     "to": "0.2.0",
///     "renames": {
///       "respond-to-a-dsr-without-missing-the-clock":
///         "answer-a-customer-data-request"
///     }
///   }
/// ]
/// ```
///
/// We apply these to user workspace-agent instances so existing
/// installs converge to the new slug layout instead of accumulating
/// old + new copies.
#[derive(Deserialize, Debug, Clone)]
pub(super) struct Migration {
    /// Version this step migrates *from*. Currently informational —
    /// included so authors document the chain end-to-end and so future
    /// strict-chain validation can opt in. The active selection logic
    /// uses `to` against the workspace's last-synced version.
    #[allow(dead_code)]
    pub from: String,
    pub to: String,
    #[serde(default)]
    pub renames: BTreeMap<String, String>,
}

/// Read `<bundled-agent>/.migrations.json` if present. Missing file is
/// not an error — it just means no migrations have been authored yet.
pub(super) fn read_migrations(bundled_agent_dir: &Path) -> CoreResult<Vec<Migration>> {
    let path = bundled_agent_dir.join(".migrations.json");
    if !path.exists() {
        return Ok(Vec::new());
    }
    let body = fs::read_to_string(&path)?;
    let migrations: Vec<Migration> = serde_json::from_str(&body).map_err(|e| {
        CoreError::Internal(format!(
            ".migrations.json invalid in {}: {e}",
            path.display()
        ))
    })?;
    Ok(migrations)
}

/// Apply a single rename step to a workspace agent's `.agents/skills/`
/// directory. Returns the number of skill folders changed (renamed or
/// deleted). The old slug is no longer in the bundled package — it's
/// orphaned, and every cross-reference (e.g. `Use the <X> skill` in
/// other prompts, `data-schema.md` columns) points to the new slug,
/// so leaving the old one alive only clutters the picker.
///
/// Three cases:
/// 1. Old exists, new doesn't → rename old → new and rewrite the
///    `name:` frontmatter so the directory and slug agree. The user's
///    body content is preserved. The metadata refresh step that runs
///    after this updates the rest of the frontmatter from the
///    bundled package.
/// 2. Old exists, new exists too → delete old. This happens when a
///    workspace synced the new slug in a previous pass (before the
///    `.migrations.json` shipped) and now has both. The old one is
///    orphaned dead weight; the new one is what the agent actually
///    uses.
/// 3. Old absent → no-op. Migration is idempotent across reruns.
pub(super) fn apply_rename_step(
    workspace_skills_dir: &Path,
    renames: &BTreeMap<String, String>,
) -> CoreResult<usize> {
    if !workspace_skills_dir.exists() || renames.is_empty() {
        return Ok(0);
    }
    let mut applied = 0;
    for (from_slug, to_slug) in renames {
        if from_slug == to_slug {
            continue;
        }
        let from_path = workspace_skills_dir.join(from_slug);
        let to_path = workspace_skills_dir.join(to_slug);
        if !from_path.exists() {
            continue;
        }
        if to_path.exists() {
            // Both old and new copies exist. Drop the old one — the
            // bundled package no longer contains it and every
            // cross-reference points at the new slug, so keeping the
            // old around just adds a duplicate card to the picker.
            tracing::info!(
                "[store] removing orphaned old skill {} (new {} already present) in {}",
                from_slug,
                to_slug,
                workspace_skills_dir.display()
            );
            fs::remove_dir_all(&from_path)?;
            applied += 1;
            continue;
        }
        fs::rename(&from_path, &to_path)?;
        // The renamed directory still has the old SKILL.md with
        // `name: <old-slug>` inside. Rewrite the `name:` line so the
        // slug, directory, and frontmatter all agree. The body stays
        // exactly as the user (or a previous sync) had it;
        // sync_existing_skill_metadata refreshes the rest of the
        // frontmatter on the same pass.
        fix_skill_name_field(&to_path, to_slug)?;
        applied += 1;
    }
    Ok(applied)
}

/// Rewrite just the `name:` frontmatter field of a moved skill so it
/// matches its new directory slug. Preserves the rest of the file
/// byte-for-byte; `sync_existing_skill_metadata` handles the wider
/// metadata refresh on the same pass.
fn fix_skill_name_field(skill_dir: &Path, slug: &str) -> CoreResult<()> {
    let skill_md = skill_dir.join("SKILL.md");
    if !skill_md.exists() {
        return Ok(());
    }
    let body = fs::read_to_string(&skill_md)?;
    let mut out = String::with_capacity(body.len());
    let mut in_frontmatter = false;
    let mut delim_seen = 0;
    let mut rewrote = false;
    for line in body.split_inclusive('\n') {
        if !rewrote && delim_seen < 2 && line.trim_end() == "---" {
            in_frontmatter = !in_frontmatter || delim_seen == 0;
            delim_seen += 1;
            out.push_str(line);
            continue;
        }
        if in_frontmatter && !rewrote {
            if let Some(rest) = line.strip_prefix("name:") {
                let _ = rest;
                out.push_str(&format!("name: {slug}\n"));
                rewrote = true;
                continue;
            }
        }
        out.push_str(line);
    }
    if rewrote && out != body {
        let tmp = skill_md.with_file_name("SKILL.md.tmp");
        fs::write(&tmp, out)?;
        fs::rename(&tmp, &skill_md)?;
    }
    Ok(())
}

/// Workspace-side marker file recording which bundled-package version
/// this workspace agent was last synced against. Lives at
/// `<workspace-agent>/.houston/bundled-package.json`. Reading it lets
/// the next sync pass know which migration steps still need applying.
const BUNDLED_PACKAGE_MARKER: &str = ".houston/bundled-package.json";

#[derive(Deserialize, Default)]
struct BundledPackageMarker {
    #[serde(default)]
    version: Option<String>,
}

fn read_bundled_marker_version(workspace_agent_dir: &Path) -> Option<String> {
    let path = workspace_agent_dir.join(BUNDLED_PACKAGE_MARKER);
    let body = fs::read_to_string(&path).ok()?;
    let marker: BundledPackageMarker = serde_json::from_str(&body).ok()?;
    marker.version
}

fn write_bundled_marker_version(workspace_agent_dir: &Path, version: &str) -> CoreResult<()> {
    let path = workspace_agent_dir.join(BUNDLED_PACKAGE_MARKER);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let body = serde_json::json!({
        "version": version,
        "synced_at": chrono::Utc::now().to_rfc3339(),
    });
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, serde_json::to_string_pretty(&body)?)?;
    fs::rename(&tmp, &path)?;
    Ok(())
}

/// Read `version` from the agent definition's `.source.json` (the file
/// `install_bundled_agent` writes). Used as the "current bundled version"
/// when picking which migration steps to apply during sync.
fn read_definition_version(agents_dir: &Path, agent_id: &str) -> Option<String> {
    let source_path = agents_dir.join(agent_id).join(".source.json");
    let body = fs::read_to_string(source_path).ok()?;
    let source: serde_json::Value = serde_json::from_str(&body).ok()?;
    source
        .get("version")
        .and_then(|v| v.as_str())
        .map(ToOwned::to_owned)
}

/// Pick the migration steps that need to run, given (a) the workspace
/// agent's last-recorded synced version, and (b) the current bundled
/// version. Migrations are applied in order; each step's `from` must be
/// strictly older than the current target.
///
/// When the workspace has no recorded version (older installs from
/// before this marker existed), we apply every migration whose `from`
/// version is older than the current bundled version. The rename
/// helpers are no-ops on already-current workspaces, so this is safe.
fn migrations_to_apply<'a>(
    migrations: &'a [Migration],
    last_synced: Option<&str>,
    target: &str,
) -> Vec<&'a Migration> {
    migrations
        .iter()
        .filter(|m| {
            // Always skip steps not yet released into the target.
            if !version_lte(&m.to, target) {
                return false;
            }
            match last_synced {
                Some(prev) => version_lt(prev, &m.to),
                None => true,
            }
        })
        .collect()
}

/// Lightweight semver-ish ordering for the dotted decimal versions
/// we use in `houston.json` / `catalog.json`. Treats missing trailing
/// components as zero. Avoids pulling in a full semver crate for
/// what's effectively `0.x.y` strings.
fn version_lt(a: &str, b: &str) -> bool {
    cmp_versions(a, b) == std::cmp::Ordering::Less
}

fn version_lte(a: &str, b: &str) -> bool {
    matches!(
        cmp_versions(a, b),
        std::cmp::Ordering::Less | std::cmp::Ordering::Equal
    )
}

fn cmp_versions(a: &str, b: &str) -> std::cmp::Ordering {
    let a_parts: Vec<u32> = a.split('.').map(|p| p.parse().unwrap_or(0)).collect();
    let b_parts: Vec<u32> = b.split('.').map(|p| p.parse().unwrap_or(0)).collect();
    let len = a_parts.len().max(b_parts.len());
    for i in 0..len {
        let av = a_parts.get(i).copied().unwrap_or(0);
        let bv = b_parts.get(i).copied().unwrap_or(0);
        match av.cmp(&bv) {
            std::cmp::Ordering::Equal => continue,
            other => return other,
        }
    }
    std::cmp::Ordering::Equal
}

pub(super) fn bundled_catalog() -> CoreResult<Option<Vec<StoreListing>>> {
    let Some(root) = bundled_store_root() else {
        return Ok(None);
    };
    let path = root.join("catalog.json");
    if !path.exists() {
        return Ok(None);
    }
    let body = fs::read_to_string(path)?;
    let catalog: BundledCatalog = serde_json::from_str(&body)?;
    Ok(Some(catalog.agents))
}

fn bundled_store_root() -> Option<PathBuf> {
    if let Ok(dir) = std::env::var("HOUSTON_STORE_DIR") {
        let path = PathBuf::from(dir);
        if path.join("catalog.json").exists() {
            return Some(path);
        }
    }

    let mut starts = Vec::new();
    if let Ok(cwd) = std::env::current_dir() {
        starts.push(cwd);
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            starts.push(parent.to_path_buf());
        }
    }

    for start in starts {
        for ancestor in start.ancestors() {
            let candidate = ancestor.join("store");
            if candidate.join("catalog.json").exists() {
                return Some(candidate);
            }
        }
    }

    None
}

pub(super) fn install_bundled_agent(
    agents_dir: &Path,
    source_agent_id: &str,
    requested_agent_id: Option<&str>,
) -> CoreResult<()> {
    let root = bundled_store_root()
        .ok_or_else(|| CoreError::NotFound("bundled Houston Store not found".into()))?;
    let source_dir = root.join("agents").join(source_agent_id);
    if !source_dir.join("houston.json").exists() {
        return Err(CoreError::NotFound(format!(
            "bundled agent not found: {source_agent_id}"
        )));
    }

    let catalog = bundled_catalog()?.unwrap_or_default();
    let listing = catalog.iter().find(|l| l.id == source_agent_id);
    let agent_id = requested_agent_id.unwrap_or(source_agent_id);
    let target_dir = agents_dir.join(agent_id);
    if target_dir.exists() {
        fs::remove_dir_all(&target_dir)?;
    }
    copy_dir_all(&source_dir, &target_dir)?;

    let source = serde_json::json!({
        "source": "houston-store",
        "agent_id": source_agent_id,
        "version": listing.and_then(|l| l.version.as_deref()),
        "content_hash": listing.and_then(|l| l.content_hash.as_deref()),
        "installed_at": chrono::Utc::now().to_rfc3339(),
    });
    fs::write(
        target_dir.join(".source.json"),
        serde_json::to_string_pretty(&source)?,
    )?;
    Ok(())
}

pub(crate) fn copy_dir_all(from: &Path, to: &Path) -> CoreResult<()> {
    fs::create_dir_all(to)?;
    for entry in fs::read_dir(from)? {
        let entry = entry?;
        let source = entry.path();
        let target = to.join(entry.file_name());
        let ty = entry.file_type()?;
        if ty.is_dir() {
            copy_dir_all(&source, &target)?;
        } else if ty.is_file() {
            fs::copy(&source, &target)?;
        }
    }
    Ok(())
}

pub(super) fn sync_bundled_agent_instances(
    docs_dir: &Path,
    agents_dir: &Path,
    agent_id: &str,
) -> CoreResult<usize> {
    let agent_dir = agents_dir.join(agent_id);
    let packaged_skills = agent_dir.join(".agents").join("skills");
    let has_packaged_skills = packaged_skills.exists();

    // Migrations declared by the bundled package. Empty list when no
    // `.migrations.json` exists, which is the common case.
    let migrations = read_migrations(&agent_dir)?;
    let target_version = read_definition_version(agents_dir, agent_id);

    let mut changed = 0;
    for workspace in workspaces::read_all(docs_dir)? {
        let workspace_dir = docs_dir.join(workspace.name);
        if !workspace_dir.exists() {
            continue;
        }
        for entry in fs::read_dir(&workspace_dir)?.flatten() {
            let folder = entry.path();
            if !folder.is_dir() {
                continue;
            }
            let meta_path = folder.join(".houston").join("agent.json");
            if !meta_path.exists() {
                continue;
            }
            let Ok(meta) = fs::read_to_string(&meta_path)
                .ok()
                .and_then(|body| serde_json::from_str::<serde_json::Value>(&body).ok())
                .ok_or(())
            else {
                continue;
            };
            if meta["config_id"].as_str() != Some(agent_id) {
                continue;
            }
            let mut instance_changed = false;

            // 1. Apply rename / removal migrations BEFORE copying new
            //    skills in. This way a renamed slug ends up at its new
            //    name first; copy_missing_skill_dirs then sees the new
            //    slug already present (preserving user-modified body)
            //    instead of installing a fresh copy alongside the old.
            if !migrations.is_empty() {
                let last_synced = read_bundled_marker_version(&folder);
                let target = target_version.as_deref().unwrap_or("");
                let steps = migrations_to_apply(&migrations, last_synced.as_deref(), target);
                if !steps.is_empty() {
                    let workspace_skills = folder.join(".agents").join("skills");
                    for step in steps {
                        let renamed = apply_rename_step(&workspace_skills, &step.renames)?;
                        if renamed > 0 {
                            instance_changed = true;
                        }
                    }
                }
            }

            // 2. Copy any net-new bundled skills, refresh metadata on
            //    existing ones (preserves user-edited bodies).
            if has_packaged_skills {
                let target = folder.join(".agents").join("skills");
                if copy_missing_skill_dirs(&packaged_skills, &target)? {
                    instance_changed = true;
                }
            }
            if clear_seeded_intro_activity(&folder)? {
                instance_changed = true;
            }

            // 3. Stamp the marker so the next sync starts from this
            //    version. Always write when we know the target version
            //    so older installs without a marker get one created.
            if let Some(target) = target_version.as_deref() {
                let _ = write_bundled_marker_version(&folder, target);
            }

            if instance_changed {
                changed += 1;
            }
        }
    }
    Ok(changed)
}

fn clear_seeded_intro_activity(agent_dir: &Path) -> CoreResult<bool> {
    let mut changed = false;
    for relative in [".houston/activity.json", ".houston/activity/activity.json"] {
        let path = agent_dir.join(relative);
        if !path.exists() {
            continue;
        }
        let body = fs::read_to_string(&path)?;
        if is_seeded_intro_activity_list(&body) {
            fs::write(&path, "[]")?;
            changed = true;
        }
    }
    Ok(changed)
}

fn is_seeded_intro_activity_list(body: &str) -> bool {
    let Ok(value) = serde_json::from_str::<serde_json::Value>(body) else {
        return false;
    };
    let Some(items) = value.as_array() else {
        return false;
    };
    let [item] = items.as_slice() else {
        return false;
    };
    let status = item.get("status").and_then(|value| value.as_str());
    let title = item
        .get("title")
        .and_then(|value| value.as_str())
        .unwrap_or_default();
    let description = item
        .get("description")
        .and_then(|value| value.as_str())
        .unwrap_or_default();

    status == Some("needs_you")
        && title.starts_with("Start anywhere")
        && description.starts_with("No upfront onboarding.")
}

fn copy_missing_skill_dirs(from: &Path, to: &Path) -> CoreResult<bool> {
    fs::create_dir_all(to)?;
    let mut changed = false;
    for entry in fs::read_dir(from)? {
        let entry = entry?;
        if !entry.file_type()?.is_dir() {
            continue;
        }
        let source = entry.path();
        let target = to.join(entry.file_name());
        if target.exists() {
            if sync_existing_skill_metadata(&source, &target)? {
                changed = true;
            }
            continue;
        }
        copy_dir_all(&source, &target)?;
        changed = true;
    }
    Ok(changed)
}

fn sync_existing_skill_metadata(source_dir: &Path, target_dir: &Path) -> CoreResult<bool> {
    let source_md = source_dir.join("SKILL.md");
    let target_md = target_dir.join("SKILL.md");
    if !source_md.exists() || !target_md.exists() {
        return Ok(false);
    }

    let (mut source_summary, _) = match houston_skills::format::parse_file(&source_md) {
        Ok(parsed) => parsed,
        Err(e) => {
            tracing::warn!(
                "[store] skipping skill metadata sync for {}: {e}",
                source_md.display()
            );
            return Ok(false);
        }
    };

    let target_raw = fs::read_to_string(&target_md)?;
    let (target_summary, target_body) = match houston_skills::format::parse_content(&target_raw) {
        Ok((summary, body)) => (Some(summary), body),
        Err(_) => (None, raw_skill_body(&target_raw).unwrap_or_default()),
    };

    if let Some(summary) = target_summary {
        source_summary.created = summary.created.or(source_summary.created);
        source_summary.last_used = summary.last_used.or(source_summary.last_used);
    }

    let updated = houston_skills::format::serialize(&source_summary, &target_body);
    if updated == target_raw {
        return Ok(false);
    }

    let tmp = target_md.with_file_name("SKILL.md.tmp");
    fs::write(&tmp, updated)?;
    fs::rename(&tmp, &target_md)?;
    Ok(true)
}

fn raw_skill_body(content: &str) -> Option<String> {
    let trimmed = content.trim_start();
    if !trimmed.starts_with("---") {
        return None;
    }
    let after_first = trimmed[3..].strip_prefix('\n').unwrap_or(&trimmed[3..]);
    let end_idx = after_first.find("\n---")?;
    let body_start = end_idx + 4;
    Some(
        after_first
            .get(body_start..)
            .unwrap_or_default()
            .trim_start_matches('\n')
            .to_string(),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agents_crud::{self, CreateAgent};
    use crate::workspaces::CreateWorkspace;
    use std::sync::Mutex;
    use tempfile::TempDir;

    static ENV_LOCK: Mutex<()> = Mutex::new(());

    fn write_bundled_agent(root: &Path, id: &str, version: &str, skill_body: &str) {
        let dir = root.join("agents").join(id);
        fs::create_dir_all(dir.join(".agents/skills/demo")).unwrap();
        fs::write(
            dir.join("houston.json"),
            format!(
                r#"{{
  "id": "{id}",
  "name": "Demo",
  "description": "Demo agent",
  "version": "{version}",
  "tabs": [{{"id": "chat", "label": "Chat", "builtIn": "chat"}}]
}}"#
            ),
        )
        .unwrap();
        fs::write(dir.join("CLAUDE.md"), "## Demo").unwrap();
        fs::write(dir.join(".agents/skills/demo/SKILL.md"), skill_body).unwrap();
    }

    fn write_catalog(root: &Path, id: &str, version: &str, hash: &str) {
        fs::write(
            root.join("catalog.json"),
            format!(
                r#"{{
  "version": 1,
  "agents": [{{
    "id": "{id}",
    "name": "Demo",
    "description": "Demo agent",
    "category": "business",
    "author": "Houston",
    "tags": ["demo"],
    "icon_url": "",
    "repo": "houston-store/{id}",
    "installs": 0,
    "registered_at": "2026-04-26",
    "version": "{version}",
    "content_hash": "{hash}",
    "bundled": true
  }}]
}}"#
            ),
        )
        .unwrap();
    }

    #[test]
    fn bundled_catalog_reads_from_store_dir() {
        let _guard = ENV_LOCK.lock().unwrap();
        let store = TempDir::new().unwrap();
        write_bundled_agent(store.path(), "demo", "1.0.0", "v1");
        write_catalog(store.path(), "demo", "1.0.0", "hash-v1");
        std::env::set_var("HOUSTON_STORE_DIR", store.path());

        let catalog = bundled_catalog().unwrap().unwrap();

        std::env::remove_var("HOUSTON_STORE_DIR");
        assert_eq!(catalog.len(), 1);
        assert_eq!(catalog[0].repo, "houston-store/demo");
        assert!(catalog[0].bundled);
    }

    #[test]
    fn install_bundled_agent_copies_package_and_source() {
        let _guard = ENV_LOCK.lock().unwrap();
        let store = TempDir::new().unwrap();
        let agents = TempDir::new().unwrap();
        write_bundled_agent(store.path(), "demo", "1.0.0", "v1");
        write_catalog(store.path(), "demo", "1.0.0", "hash-v1");
        std::env::set_var("HOUSTON_STORE_DIR", store.path());

        install_bundled_agent(agents.path(), "demo", Some("demo")).unwrap();

        std::env::remove_var("HOUSTON_STORE_DIR");
        assert!(agents.path().join("demo/houston.json").exists());
        assert!(agents
            .path()
            .join("demo/.agents/skills/demo/SKILL.md")
            .exists());
        let source = fs::read_to_string(agents.path().join("demo/.source.json")).unwrap();
        assert!(source.contains(r#""source": "houston-store""#));
        assert!(source.contains(r#""content_hash": "hash-v1""#));
    }

    #[test]
    fn check_updates_refreshes_bundled_agent() {
        let _guard = ENV_LOCK.lock().unwrap();
        let store = TempDir::new().unwrap();
        let agents = TempDir::new().unwrap();
        write_bundled_agent(store.path(), "demo", "1.0.0", "v1");
        write_catalog(store.path(), "demo", "1.0.0", "hash-v1");
        std::env::set_var("HOUSTON_STORE_DIR", store.path());
        install_bundled_agent(agents.path(), "demo", Some("demo")).unwrap();

        fs::remove_dir_all(store.path().join("agents/demo")).unwrap();
        write_bundled_agent(store.path(), "demo", "1.1.0", "v2");
        write_catalog(store.path(), "demo", "1.1.0", "hash-v2");

        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        let updated = rt
            .block_on(crate::store::check_agent_updates(agents.path()))
            .unwrap();

        std::env::remove_var("HOUSTON_STORE_DIR");
        assert_eq!(updated, vec!["demo"]);
        let skill =
            fs::read_to_string(agents.path().join("demo/.agents/skills/demo/SKILL.md")).unwrap();
        assert_eq!(skill, "v2");
    }

    #[test]
    fn sync_bundled_agent_instances_copies_new_skills_only() {
        let _guard = ENV_LOCK.lock().unwrap();
        let store = TempDir::new().unwrap();
        let agents = TempDir::new().unwrap();
        let docs = TempDir::new().unwrap();
        write_bundled_agent(store.path(), "demo", "1.0.0", "v1");
        write_catalog(store.path(), "demo", "1.0.0", "hash-v1");
        std::env::set_var("HOUSTON_STORE_DIR", store.path());
        install_bundled_agent(agents.path(), "demo", Some("demo")).unwrap();

        let ws = workspaces::create(
            docs.path(),
            CreateWorkspace {
                name: "Acme".into(),
            },
        )
        .unwrap();
        agents_crud::create(
            docs.path(),
            &ws.id,
            CreateAgent {
                name: "Ops".into(),
                config_id: "demo".into(),
                color: None,
                claude_md: None,
                installed_path: Some(agents.path().join("demo").to_string_lossy().to_string()),
                seeds: None,
                existing_path: None,
            },
        )
        .unwrap();

        let instance_skill = docs.path().join("Acme/Ops/.agents/skills/demo/SKILL.md");
        fs::write(&instance_skill, "user edited").unwrap();
        fs::remove_dir_all(store.path().join("agents/demo")).unwrap();
        write_bundled_agent(store.path(), "demo", "1.1.0", "v2");
        fs::create_dir_all(store.path().join("agents/demo/.agents/skills/new-action")).unwrap();
        fs::write(
            store
                .path()
                .join("agents/demo/.agents/skills/new-action/SKILL.md"),
            "new",
        )
        .unwrap();
        write_catalog(store.path(), "demo", "1.1.0", "hash-v2");
        install_bundled_agent(agents.path(), "demo", Some("demo")).unwrap();

        let changed = sync_bundled_agent_instances(docs.path(), agents.path(), "demo").unwrap();

        std::env::remove_var("HOUSTON_STORE_DIR");
        assert_eq!(changed, 1);
        assert_eq!(fs::read_to_string(instance_skill).unwrap(), "user edited");
        assert!(docs
            .path()
            .join("Acme/Ops/.agents/skills/new-action/SKILL.md")
            .exists());
    }

    #[test]
    fn sync_bundled_agent_instances_refreshes_skill_metadata_only() {
        let _guard = ENV_LOCK.lock().unwrap();
        let store = TempDir::new().unwrap();
        let agents = TempDir::new().unwrap();
        let docs = TempDir::new().unwrap();
        let old_skill = r#"---
name: demo
description: Old action
version: 1
tags: []
---

# Demo

Package v1 body
"#;
        let new_skill = r#"---
name: demo
description: New action
version: 2
tags: [demo]
---

# Demo

Package v2 body
"#;
        write_bundled_agent(store.path(), "demo", "1.0.0", old_skill);
        write_catalog(store.path(), "demo", "1.0.0", "hash-v1");
        std::env::set_var("HOUSTON_STORE_DIR", store.path());
        install_bundled_agent(agents.path(), "demo", Some("demo")).unwrap();

        let ws = workspaces::create(
            docs.path(),
            CreateWorkspace {
                name: "Acme".into(),
            },
        )
        .unwrap();
        agents_crud::create(
            docs.path(),
            &ws.id,
            CreateAgent {
                name: "Ops".into(),
                config_id: "demo".into(),
                color: None,
                claude_md: None,
                installed_path: Some(agents.path().join("demo").to_string_lossy().to_string()),
                seeds: None,
                existing_path: None,
            },
        )
        .unwrap();

        let instance_skill = docs.path().join("Acme/Ops/.agents/skills/demo/SKILL.md");
        fs::write(
            &instance_skill,
            r#"---
name: demo
description: User-customized action
version: 1
tags: []
last_used: 2026-04-20
---

# Demo

User customized body
"#,
        )
        .unwrap();
        fs::remove_dir_all(store.path().join("agents/demo")).unwrap();
        write_bundled_agent(store.path(), "demo", "1.1.0", new_skill);
        write_catalog(store.path(), "demo", "1.1.0", "hash-v2");
        install_bundled_agent(agents.path(), "demo", Some("demo")).unwrap();

        let changed = sync_bundled_agent_instances(docs.path(), agents.path(), "demo").unwrap();

        std::env::remove_var("HOUSTON_STORE_DIR");
        assert_eq!(changed, 1);
        let updated = fs::read_to_string(&instance_skill).unwrap();
        let (summary, body) = houston_skills::format::parse_content(&updated).unwrap();
        assert_eq!(summary.description, "New action");
        assert_eq!(summary.version, 2);
        assert_eq!(summary.last_used.as_deref(), Some("2026-04-20"));
        assert!(summary.inputs.is_empty());
        assert!(summary.prompt_template.is_none());
        assert!(body.contains("User customized body"));
        assert!(!body.contains("Package v2 body"));
    }

    #[test]
    fn sync_bundled_agent_instances_removes_seeded_intro_activity_only() {
        let _guard = ENV_LOCK.lock().unwrap();
        let store = TempDir::new().unwrap();
        let agents = TempDir::new().unwrap();
        let docs = TempDir::new().unwrap();
        write_bundled_agent(store.path(), "demo", "1.0.0", "v1");
        write_catalog(store.path(), "demo", "1.0.0", "hash-v1");
        std::env::set_var("HOUSTON_STORE_DIR", store.path());
        install_bundled_agent(agents.path(), "demo", Some("demo")).unwrap();

        let ws = workspaces::create(
            docs.path(),
            CreateWorkspace {
                name: "Acme".into(),
            },
        )
        .unwrap();
        agents_crud::create(
            docs.path(),
            &ws.id,
            CreateAgent {
                name: "Ops".into(),
                config_id: "demo".into(),
                color: None,
                claude_md: None,
                installed_path: Some(agents.path().join("demo").to_string_lossy().to_string()),
                seeds: None,
                existing_path: None,
            },
        )
        .unwrap();

        let agent_dir = docs.path().join("Acme/Ops");
        let legacy_activity = agent_dir.join(".houston/activity.json");
        let nested_activity = agent_dir.join(".houston/activity/activity.json");
        fs::create_dir_all(nested_activity.parent().unwrap()).unwrap();
        let seeded = r#"[{"id":"seeded","title":"Start anywhere - I'll ask for what I need","description":"No upfront onboarding. Tell me what you want to do.","status":"needs_you"}]"#;
        fs::write(&legacy_activity, seeded).unwrap();
        fs::write(&nested_activity, seeded).unwrap();

        let changed = sync_bundled_agent_instances(docs.path(), agents.path(), "demo").unwrap();

        assert_eq!(changed, 1);
        assert_eq!(fs::read_to_string(&legacy_activity).unwrap(), "[]");
        assert_eq!(fs::read_to_string(&nested_activity).unwrap(), "[]");

        let real_activity =
            r#"[{"id":"real","title":"Real work","description":"Keep this","status":"needs_you"}]"#;
        fs::write(&legacy_activity, real_activity).unwrap();
        fs::write(&nested_activity, real_activity).unwrap();

        let changed = sync_bundled_agent_instances(docs.path(), agents.path(), "demo").unwrap();

        std::env::remove_var("HOUSTON_STORE_DIR");
        assert_eq!(changed, 0);
        assert_eq!(fs::read_to_string(&legacy_activity).unwrap(), real_activity);
        assert_eq!(fs::read_to_string(&nested_activity).unwrap(), real_activity);
    }

    #[test]
    fn bundled_store_skills_parse_without_forms() {
        let store_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../store/agents");
        assert!(
            store_dir.exists(),
            "expected bundled Store agents at {}",
            store_dir.display()
        );

        let mut files = Vec::new();
        collect_skill_files(&store_dir, &mut files);
        assert!(
            files.len() >= 8,
            "expected bundled Store skills under {}",
            store_dir.display()
        );

        for file in &files {
            let (summary, _) = houston_skills::format::parse_file(file)
                .unwrap_or_else(|e| panic!("{} failed to parse: {e}", file.display()));
            assert!(
                summary.inputs.is_empty(),
                "{} must not declare legacy form inputs",
                file.display()
            );
            assert!(
                summary.prompt_template.is_none(),
                "{} must not declare legacy prompt_template",
                file.display()
            );
        }
    }

    #[test]
    fn bundled_store_agents_do_not_seed_activity_cards() {
        let store_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../store/agents");
        assert!(
            store_dir.exists(),
            "expected bundled Store agents at {}",
            store_dir.display()
        );

        let entries = fs::read_dir(&store_dir).unwrap_or_else(|e| {
            panic!("failed to read {}: {e}", store_dir.display());
        });
        for entry in entries.flatten() {
            let manifest_path = entry.path().join("houston.json");
            if !manifest_path.exists() {
                continue;
            }
            let body = fs::read_to_string(&manifest_path).unwrap_or_else(|e| {
                panic!("failed to read {}: {e}", manifest_path.display());
            });
            let manifest: serde_json::Value = serde_json::from_str(&body).unwrap_or_else(|e| {
                panic!("failed to parse {}: {e}", manifest_path.display());
            });
            let Some(seeds) = manifest
                .get("agentSeeds")
                .and_then(|value| value.as_object())
            else {
                continue;
            };
            assert!(
                !seeds.contains_key(".houston/activity.json"),
                "{} must not seed legacy activity cards",
                manifest_path.display()
            );
            assert!(
                !seeds.contains_key(".houston/activity/activity.json"),
                "{} must not seed activity cards",
                manifest_path.display()
            );
        }
    }

    fn collect_skill_files(dir: &Path, out: &mut Vec<PathBuf>) {
        let entries = fs::read_dir(dir).unwrap_or_else(|e| {
            panic!("failed to read {}: {e}", dir.display());
        });
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                collect_skill_files(&path, out);
            } else if path.file_name().and_then(|name| name.to_str()) == Some("SKILL.md") {
                out.push(path);
            }
        }
    }
    // ── Migration tests ───────────────────────────────────────────────

    #[test]
    fn version_ordering_handles_dotted_decimals() {
        assert!(version_lt("0.1.4", "0.2.0"));
        assert!(version_lt("0.1.4", "0.1.5"));
        assert!(version_lt("0.1.4", "0.1.4.1"));
        assert!(!version_lt("0.2.0", "0.1.4"));
        assert!(!version_lt("1.0.0", "1.0.0"));
        assert!(version_lte("0.1.4", "0.2.0"));
        assert!(version_lte("1.0.0", "1.0.0"));
        assert!(!version_lte("0.2.0", "0.1.4"));
    }

    #[test]
    fn migrations_to_apply_skips_already_synced_steps() {
        let migrations = vec![
            Migration {
                from: "0.1.0".into(),
                to: "0.1.5".into(),
                renames: BTreeMap::new(),
            },
            Migration {
                from: "0.1.5".into(),
                to: "0.2.0".into(),
                renames: BTreeMap::new(),
            },
            Migration {
                from: "0.2.0".into(),
                to: "0.3.0".into(),
                renames: BTreeMap::new(),
            },
        ];
        // Workspace last synced at 0.1.5: skip the 0.1.0→0.1.5 step,
        // apply 0.1.5→0.2.0 and 0.2.0→0.3.0.
        let steps = migrations_to_apply(&migrations, Some("0.1.5"), "0.3.0");
        assert_eq!(steps.len(), 2);
        assert_eq!(steps[0].to, "0.2.0");
        assert_eq!(steps[1].to, "0.3.0");
    }

    #[test]
    fn migrations_to_apply_caps_at_target_version() {
        let migrations = vec![
            Migration {
                from: "0.1.0".into(),
                to: "0.2.0".into(),
                renames: BTreeMap::new(),
            },
            Migration {
                from: "0.2.0".into(),
                to: "0.3.0".into(),
                renames: BTreeMap::new(),
            },
        ];
        // Target only 0.2.0: should not pick up the 0.2.0→0.3.0 step.
        let steps = migrations_to_apply(&migrations, Some("0.1.0"), "0.2.0");
        assert_eq!(steps.len(), 1);
        assert_eq!(steps[0].to, "0.2.0");
    }

    #[test]
    fn migrations_to_apply_with_no_marker_runs_all_relevant_steps() {
        let migrations = vec![Migration {
            from: "0.1.4".into(),
            to: "0.2.0".into(),
            renames: BTreeMap::new(),
        }];
        // Workspace has no marker yet (older install). Target is 0.2.0.
        // We apply the step.
        let steps = migrations_to_apply(&migrations, None, "0.2.0");
        assert_eq!(steps.len(), 1);
    }

    #[test]
    fn apply_rename_step_renames_directory_and_fixes_name_field() {
        let dir = TempDir::new().unwrap();
        let skills = dir.path();
        let old = skills.join("old-slug");
        fs::create_dir_all(&old).unwrap();
        fs::write(
            old.join("SKILL.md"),
            "---\nname: old-slug\ndescription: a thing\nversion: 1\ntags: []\n---\n\n# Body\n",
        )
        .unwrap();

        let mut renames = BTreeMap::new();
        renames.insert("old-slug".into(), "new-slug".into());
        let applied = apply_rename_step(skills, &renames).unwrap();

        assert_eq!(applied, 1);
        assert!(!skills.join("old-slug").exists());
        assert!(skills.join("new-slug").exists());
        let body = fs::read_to_string(skills.join("new-slug/SKILL.md")).unwrap();
        assert!(body.contains("name: new-slug"));
        assert!(!body.contains("name: old-slug"));
    }

    #[test]
    fn apply_rename_step_deletes_old_when_target_already_exists() {
        let dir = TempDir::new().unwrap();
        let skills = dir.path();
        let old = skills.join("old-slug");
        let new = skills.join("new-slug");
        fs::create_dir_all(&old).unwrap();
        fs::create_dir_all(&new).unwrap();
        fs::write(
            old.join("SKILL.md"),
            "---\nname: old-slug\ndescription: x\n---\nold body",
        )
        .unwrap();
        fs::write(
            new.join("SKILL.md"),
            "---\nname: new-slug\ndescription: y\n---\nnew body",
        )
        .unwrap();

        let mut renames = BTreeMap::new();
        renames.insert("old-slug".into(), "new-slug".into());
        let applied = apply_rename_step(skills, &renames).unwrap();

        // Both already exist. The old one is orphaned (bundled
        // package no longer ships it, every cross-reference points
        // at the new slug). Delete it so the picker stops showing
        // the duplicate card.
        assert_eq!(applied, 1);
        assert!(!skills.join("old-slug").exists());
        assert!(skills.join("new-slug").exists());
        // The new slug's body must be untouched.
        let new_body = fs::read_to_string(skills.join("new-slug/SKILL.md")).unwrap();
        assert!(new_body.contains("new body"));
    }

    #[test]
    fn sync_applies_rename_migration_and_writes_marker() {
        let _guard = ENV_LOCK.lock().unwrap();
        let store = TempDir::new().unwrap();
        let agents = TempDir::new().unwrap();
        let docs = TempDir::new().unwrap();

        // 1. Bundled v0.1.4 ships with `old-slug`.
        write_bundled_agent_with_skills(
            store.path(),
            "demo",
            "0.1.4",
            &[("old-slug", "old body")],
            None,
        );
        write_catalog(store.path(), "demo", "0.1.4", "hash-v1");
        std::env::set_var("HOUSTON_STORE_DIR", store.path());
        install_bundled_agent(agents.path(), "demo", Some("demo")).unwrap();

        // 2. User creates a workspace agent and tweaks the body.
        let ws = workspaces::create(
            docs.path(),
            CreateWorkspace {
                name: "Acme".into(),
            },
        )
        .unwrap();
        agents_crud::create(
            docs.path(),
            &ws.id,
            CreateAgent {
                name: "Ops".into(),
                config_id: "demo".into(),
                color: None,
                claude_md: None,
                installed_path: Some(agents.path().join("demo").to_string_lossy().to_string()),
                seeds: None,
                existing_path: None,
            },
        )
        .unwrap();
        let user_skill = docs
            .path()
            .join("Acme/Ops/.agents/skills/old-slug/SKILL.md");
        fs::write(
            &user_skill,
            "---\nname: old-slug\ndescription: my edits\n---\nuser edited body",
        )
        .unwrap();

        // 3. Bundled jumps to v0.2.0: same skill renamed to `new-slug`,
        //    declared in `.migrations.json`.
        fs::remove_dir_all(store.path().join("agents/demo")).unwrap();
        let migrations = r#"[
  {"from": "0.1.4", "to": "0.2.0", "renames": {"old-slug": "new-slug"}}
]"#;
        write_bundled_agent_with_skills(
            store.path(),
            "demo",
            "0.2.0",
            &[("new-slug", "new bundled body")],
            Some(migrations),
        );
        write_catalog(store.path(), "demo", "0.2.0", "hash-v2");
        install_bundled_agent(agents.path(), "demo", Some("demo")).unwrap();

        // 4. Sync.
        let changed = sync_bundled_agent_instances(docs.path(), agents.path(), "demo").unwrap();

        std::env::remove_var("HOUSTON_STORE_DIR");
        assert_eq!(changed, 1, "workspace should report a sync change");
        assert!(
            !docs
                .path()
                .join("Acme/Ops/.agents/skills/old-slug")
                .exists(),
            "old slug should have been renamed away"
        );
        let renamed_md = docs
            .path()
            .join("Acme/Ops/.agents/skills/new-slug/SKILL.md");
        assert!(renamed_md.exists(), "new slug should be present");
        let renamed_body = fs::read_to_string(&renamed_md).unwrap();
        // The user-edited body content must still be in there.
        assert!(
            renamed_body.contains("user edited body"),
            "user-edited body should be preserved across the rename"
        );
        // And the `name:` field must agree with the new slug.
        assert!(renamed_body.contains("name: new-slug"));

        // Marker recorded so the next sync skips the already-applied
        // rename step.
        let marker_body =
            fs::read_to_string(docs.path().join("Acme/Ops/.houston/bundled-package.json"))
                .expect("bundled-package.json should be written after sync");
        assert!(marker_body.contains(r#""version": "0.2.0""#));
    }

    #[test]
    fn sync_collapses_duplicates_when_workspace_already_synced_new_slug() {
        // Reproduces the user-reported "75 actions in the picker" case:
        // a workspace agent installed at v0.1.4 received the v0.2.0
        // bundled-package update *before* `.migrations.json` shipped,
        // so the new slug got copied alongside the old one. Now both
        // exist. After the migration ships and sync runs, the old
        // slug should disappear.
        let _guard = ENV_LOCK.lock().unwrap();
        let store = TempDir::new().unwrap();
        let agents = TempDir::new().unwrap();
        let docs = TempDir::new().unwrap();

        write_bundled_agent_with_skills(
            store.path(),
            "demo",
            "0.1.4",
            &[("old-slug", "v1 body")],
            None,
        );
        write_catalog(store.path(), "demo", "0.1.4", "hash-v1");
        std::env::set_var("HOUSTON_STORE_DIR", store.path());
        install_bundled_agent(agents.path(), "demo", Some("demo")).unwrap();

        let ws = workspaces::create(
            docs.path(),
            CreateWorkspace {
                name: "Acme".into(),
            },
        )
        .unwrap();
        agents_crud::create(
            docs.path(),
            &ws.id,
            CreateAgent {
                name: "Ops".into(),
                config_id: "demo".into(),
                color: None,
                claude_md: None,
                installed_path: Some(agents.path().join("demo").to_string_lossy().to_string()),
                seeds: None,
                existing_path: None,
            },
        )
        .unwrap();

        // Simulate the buggy state we want to recover from: workspace
        // has both `old-slug` (from v0.1.4 install) AND `new-slug`
        // (copied in by the v0.2.0 update before the migration shipped).
        let workspace_skills = docs.path().join("Acme/Ops/.agents/skills");
        fs::create_dir_all(workspace_skills.join("new-slug")).unwrap();
        fs::write(
            workspace_skills.join("new-slug/SKILL.md"),
            "---\nname: new-slug\ndescription: synced from bundled\nversion: 1\ntags: []\ninputs:\n  - name: x\n    label: X\nprompt_template: |\n  use {{x}}\n---\n\nnew body\n",
        )
        .unwrap();

        // Now publish v0.2.0 with a `.migrations.json` that maps
        // old-slug → new-slug.
        fs::remove_dir_all(store.path().join("agents/demo")).unwrap();
        let migrations = r#"[
  {"from": "0.1.4", "to": "0.2.0", "renames": {"old-slug": "new-slug"}}
]"#;
        write_bundled_agent_with_skills(
            store.path(),
            "demo",
            "0.2.0",
            &[("new-slug", "new body")],
            Some(migrations),
        );
        write_catalog(store.path(), "demo", "0.2.0", "hash-v2");
        install_bundled_agent(agents.path(), "demo", Some("demo")).unwrap();

        let changed = sync_bundled_agent_instances(docs.path(), agents.path(), "demo").unwrap();

        std::env::remove_var("HOUSTON_STORE_DIR");
        assert_eq!(changed, 1);
        // The old slug should be gone.
        assert!(
            !workspace_skills.join("old-slug").exists(),
            "old-slug should have been deleted as orphaned"
        );
        // The new slug should still be present.
        assert!(workspace_skills.join("new-slug").exists());
    }

    fn write_bundled_agent_with_skills(
        root: &Path,
        id: &str,
        version: &str,
        skills: &[(&str, &str)],
        migrations: Option<&str>,
    ) {
        let dir = root.join("agents").join(id);
        fs::create_dir_all(dir.join(".agents/skills")).unwrap();
        fs::write(
            dir.join("houston.json"),
            format!(
                r#"{{
  "id": "{id}",
  "name": "Demo",
  "description": "Demo agent",
  "version": "{version}",
  "tabs": [{{"id": "chat", "label": "Chat", "builtIn": "chat"}}]
}}"#
            ),
        )
        .unwrap();
        fs::write(dir.join("CLAUDE.md"), "## Demo").unwrap();
        for (slug, body) in skills {
            let skill_dir = dir.join(".agents/skills").join(slug);
            fs::create_dir_all(&skill_dir).unwrap();
            fs::write(
                skill_dir.join("SKILL.md"),
                format!(
                    "---\nname: {slug}\ndescription: a thing\nversion: 1\ntags: []\ninputs:\n  - name: x\n    label: X\nprompt_template: |\n  use {{{{x}}}}\n---\n\n{body}\n"
                ),
            )
            .unwrap();
        }
        if let Some(migrations_body) = migrations {
            fs::write(dir.join(".migrations.json"), migrations_body).unwrap();
        }
    }
}
