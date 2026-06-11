//! Filesystem watcher for agent directories.
//!
//! Watches an agent's workspace (`~/Documents/Houston/<name>/`) and emits
//! `HoustonEvent` variants when files change. This catches writes made
//! directly by the CLI agent that bypass Tauri commands — the key piece
//! of Houston's AI-native reactivity model.
//!
//! Uses `notify` with 500ms debouncing to avoid flooding events during
//! rapid writes (e.g., an agent streaming output to a file).

use houston_ui_events::{DynEventSink, HoustonEvent};
use notify_debouncer_mini::{new_debouncer, DebouncedEventKind};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::Mutex;

/// Active watcher handle. Drop to stop watching.
pub struct AgentWatcher {
    _debouncer: notify_debouncer_mini::Debouncer<notify::RecommendedWatcher>,
}

/// Transport-neutral handle for the active agent watcher. Wrap in whatever
/// state container the host app uses (Tauri `State`, axum `State`, ...).
pub struct WatcherState(pub Arc<Mutex<Option<AgentWatcher>>>);

impl Default for WatcherState {
    fn default() -> Self {
        Self(Arc::new(Mutex::new(None)))
    }
}

/// Map a changed file path to the appropriate `HoustonEvent`.
fn classify_change(agent_path: &str, relative: &Path) -> Option<HoustonEvent> {
    let rel_str = relative.to_string_lossy();

    // .agents/skills/ (skill.sh convention — source of truth for skills)
    if rel_str.starts_with(".agents/skills") {
        return Some(HoustonEvent::SkillsChanged {
            agent_path: agent_path.to_string(),
        });
    }

    // .claude/skills/ (Claude Code convention — live links to .agents/skills/)
    // Agents delete skills here, so we must emit SkillsChanged for these too.
    if rel_str.starts_with(".claude/skills") {
        return Some(HoustonEvent::SkillsChanged {
            agent_path: agent_path.to_string(),
        });
    }

    // .houston/ internal files — per-type folder layout: .houston/<type>/<type>.json
    if rel_str.starts_with(".houston/") {
        let inner = &rel_str[".houston/".len()..];

        if inner.starts_with("skills") {
            return Some(HoustonEvent::SkillsChanged {
                agent_path: agent_path.to_string(),
            });
        }
        if inner.starts_with("prompts") {
            return Some(HoustonEvent::ContextChanged {
                agent_path: agent_path.to_string(),
            });
        }
        // Schema files are never user-data changes.
        if inner.ends_with(".schema.json") {
            return None;
        }

        // First path component is the data type name.
        let first = inner.split('/').next().unwrap_or("");
        let agent_path = agent_path.to_string();
        return match first {
            "activity" => Some(HoustonEvent::ActivityChanged { agent_path }),
            "routines" => Some(HoustonEvent::RoutinesChanged { agent_path }),
            "routine_runs" => Some(HoustonEvent::RoutineRunsChanged { agent_path }),
            "config" => Some(HoustonEvent::ConfigChanged { agent_path }),
            "learnings" => Some(HoustonEvent::LearningsChanged { agent_path }),
            _ => None,
        };
    }

    // CLAUDE.md at workspace root
    if rel_str == "CLAUDE.md" {
        return Some(HoustonEvent::ContextChanged {
            agent_path: agent_path.to_string(),
        });
    }

    // Non-.houston files (user documents, etc.)
    Some(HoustonEvent::FilesChanged {
        agent_path: agent_path.to_string(),
    })
}

/// Start watching an agent directory for file changes. Emits `HoustonEvent`
/// variants into the injected sink.
pub fn start_watching(
    sink: DynEventSink,
    agent_path: String,
) -> Result<AgentWatcher, String> {
    let ws_path = agent_path.clone();
    let root = PathBuf::from(&agent_path);

    let mut debouncer = new_debouncer(
        Duration::from_millis(500),
        move |events: Result<Vec<notify_debouncer_mini::DebouncedEvent>, notify::Error>| {
            let events = match events {
                Ok(e) => e,
                Err(err) => {
                    tracing::error!("[watcher] error: {err}");
                    return;
                }
            };

            // Deduplicate events by event type (multiple file changes may map to the same event)
            let mut emitted = std::collections::HashSet::new();

            for event in events {
                if event.kind != DebouncedEventKind::Any {
                    continue;
                }
                let path = &event.path;
                let relative = match path.strip_prefix(&root) {
                    Ok(r) => r,
                    Err(_) => {
                        tracing::warn!("[watcher] skip: cannot strip prefix {} from {}", root.display(), path.display());
                        continue;
                    }
                };

                if let Some(houston_event) = classify_change(&ws_path, relative) {
                    // Use the event type name as dedup key
                    let key = format!("{:?}", std::mem::discriminant(&houston_event));
                    if emitted.insert(key.clone()) {
                        tracing::debug!("[watcher] emit: {key} for {}", relative.display());
                        sink.emit(houston_event);
                    }
                }
            }
        },
    )
    .map_err(|e| format!("Failed to create file watcher: {e}"))?;

    // Watch the entire agent directory recursively
    let watch_path = PathBuf::from(&agent_path);
    debouncer
        .watcher()
        .watch(&watch_path, notify::RecursiveMode::Recursive)
        .map_err(|e| format!("Failed to start watching {agent_path}: {e}"))?;

    tracing::info!("[watcher] Watching: {agent_path}");

    Ok(AgentWatcher {
        _debouncer: debouncer,
    })
}
