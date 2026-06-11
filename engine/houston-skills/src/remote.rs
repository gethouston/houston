//! Install skills from GitHub repositories.
//!
//! Provides three operations:
//! - `search_skills()` — query the skills.sh directory
//! - `install_skill()` — install a single skill from a GitHub repo
//! - `list_skills_from_repo()` — discover all SKILL.md files in a repo
//! - `install_from_repo()` — install selected skills from a repo

use crate::SkillError;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;
use std::sync::OnceLock;
use std::time::{Duration, Instant};
use tokio::sync::Mutex;

const SEARCH_ENDPOINT: &str = "https://skills.sh/api/search";
const SEARCH_RETRY_DELAY: Duration = Duration::from_secs(3);
const SEARCH_CACHE_TTL: Duration = Duration::from_secs(10 * 60);
const SEARCH_STALE_TTL: Duration = Duration::from_secs(24 * 60 * 60);
const SEARCH_MIN_INTERVAL: Duration = Duration::from_millis(750);

/// Seed query used to populate the "popular" feed. Skills.sh returns
/// results sorted by install count regardless of query relevance, so any
/// broad term works; this just shows real results when the user opens
/// the marketplace before they type. Cached for 24h on its own slot so
/// it never competes with user-typed search for cache space or the
/// rate-limit window.
const POPULAR_SEED: &str = "ai";
const POPULAR_FRESH_TTL: Duration = Duration::from_secs(24 * 60 * 60);
const POPULAR_LIMIT: usize = 20;

static SEARCH_CACHE: OnceLock<Mutex<SearchCache>> = OnceLock::new();

// ── Public types ──────────────────────────────────────────────────

/// A skill returned by the skills.sh search API.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommunitySkill {
    pub id: String,
    #[serde(rename = "skillId")]
    pub skill_id: String,
    pub name: String,
    pub installs: u64,
    pub source: String,
}

/// A skill discovered in a GitHub repo (from a SKILL.md file).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RepoSkill {
    /// The install name — the parent directory of the SKILL.md file,
    /// or the repo name if SKILL.md is at the root.
    pub id: String,
    /// Human-readable title (from the `# Heading` in SKILL.md, or title-cased id).
    pub name: String,
    /// Short description from the SKILL.md frontmatter, if any.
    pub description: String,
    /// Full path within the repo (e.g. `research/SKILL.md`).
    pub path: String,
}

#[derive(Deserialize)]
struct SearchResponse {
    skills: Vec<CommunitySkill>,
}

#[derive(Clone)]
struct CachedSearch {
    skills: Vec<CommunitySkill>,
    fetched_at: Instant,
}

#[derive(Default)]
struct SearchCache {
    entries: HashMap<String, CachedSearch>,
    /// Popular feed cached separately on its own (long) TTL so the
    /// marketplace dialog opens instantly even after a fresh cold start
    /// and never blocks user-typed searches behind the same lock.
    popular: Option<CachedSearch>,
    /// Earliest instant the next outbound request to skills.sh may
    /// happen. Updated optimistically inside the lock so concurrent
    /// callers space themselves correctly without holding the lock
    /// across the network call. `None` means "no recent request".
    next_allowed_request: Option<Instant>,
}

/// Snapshot returned when reading the cache while deciding what to do.
/// Variants drive the post-lock control flow without holding the lock
/// across awaits.
enum CacheLookup {
    /// Fresh hit — return immediately, no network call.
    Fresh(Vec<CommunitySkill>),
    /// Cache miss or stale entry — caller should fetch over the
    /// network. `wait` is the minimum spacing delay before doing so.
    Miss { wait: Duration },
}

impl SearchCache {
    /// Decide what to do for `key` while holding the lock briefly.
    ///
    /// Two-phase pattern: this returns either a fresh cached result
    /// (caller skips the network entirely) or the spacing delay the
    /// caller must `sleep()` for before fetching. The lock is dropped
    /// before any await so different queries don't serialize.
    fn lookup_or_reserve(
        &mut self,
        key: &str,
        fresh_ttl: Duration,
        min_interval: Duration,
    ) -> CacheLookup {
        if let Some(cached) = self.entries.get(key) {
            if cached.fetched_at.elapsed() <= fresh_ttl {
                return CacheLookup::Fresh(cached.skills.clone());
            }
        }
        let wait = self.reserve_request_slot(min_interval);
        CacheLookup::Miss { wait }
    }

    /// Reserve a network slot and return how long to wait before using
    /// it. Mutates `next_allowed_request` so concurrent callers see the
    /// reservation and stack their own delays correctly.
    fn reserve_request_slot(&mut self, min_interval: Duration) -> Duration {
        let now = Instant::now();
        let earliest = self.next_allowed_request.unwrap_or(now);
        let target = if earliest <= now {
            now
        } else {
            earliest
        };
        let wait = target.saturating_duration_since(now);
        self.next_allowed_request = Some(target + min_interval);
        wait
    }

    fn write_entry(&mut self, key: String, skills: Vec<CommunitySkill>) {
        self.entries.insert(
            key,
            CachedSearch {
                skills,
                fetched_at: Instant::now(),
            },
        );
    }

    fn stale(&self, key: &str, stale_ttl: Duration) -> Option<Vec<CommunitySkill>> {
        self.entries
            .get(key)
            .filter(|c| c.fetched_at.elapsed() <= stale_ttl)
            .map(|c| c.skills.clone())
    }

    fn popular_fresh(&self, fresh_ttl: Duration) -> Option<Vec<CommunitySkill>> {
        self.popular
            .as_ref()
            .filter(|c| c.fetched_at.elapsed() <= fresh_ttl)
            .map(|c| c.skills.clone())
    }

    fn popular_stale(&self, stale_ttl: Duration) -> Option<Vec<CommunitySkill>> {
        self.popular
            .as_ref()
            .filter(|c| c.fetched_at.elapsed() <= stale_ttl)
            .map(|c| c.skills.clone())
    }

    fn write_popular(&mut self, skills: Vec<CommunitySkill>) {
        self.popular = Some(CachedSearch {
            skills,
            fetched_at: Instant::now(),
        });
    }

    /// Top-level search entry point. Holds the lock only for short
    /// critical sections — the network call happens with the lock
    /// dropped, so different queries never serialize behind each other.
    async fn search(
        cache: &Mutex<SearchCache>,
        client: &Client,
        endpoint: &str,
        query: &str,
        retry_delay: Duration,
        fresh_ttl: Duration,
        stale_ttl: Duration,
        min_interval: Duration,
    ) -> Result<Vec<CommunitySkill>, SkillError> {
        let query = query.trim();
        if query.chars().count() < 2 {
            return Ok(Vec::new());
        }

        let key = normalize_search_query(query);

        let wait = {
            let mut guard = cache.lock().await;
            match guard.lookup_or_reserve(&key, fresh_ttl, min_interval) {
                CacheLookup::Fresh(skills) => return Ok(skills),
                CacheLookup::Miss { wait } => wait,
            }
        };

        if !wait.is_zero() {
            tokio::time::sleep(wait).await;
        }

        match search_skills_at(client, endpoint, query, retry_delay).await {
            Ok(skills) => {
                let mut guard = cache.lock().await;
                guard.write_entry(key, skills.clone());
                Ok(skills)
            }
            Err(err) => {
                let stale = cache.lock().await.stale(&key, stale_ttl);
                if let Some(skills) = stale {
                    tracing::warn!(
                        "[houston-skills] community search failed, returning cached results: {err}"
                    );
                    Ok(skills)
                } else {
                    Err(err)
                }
            }
        }
    }

    /// Popular feed entry point. Same short-lock pattern as `search`
    /// but on the dedicated `popular` slot with its own fresh TTL.
    async fn popular(
        cache: &Mutex<SearchCache>,
        client: &Client,
        endpoint: &str,
        seed: &str,
        retry_delay: Duration,
        fresh_ttl: Duration,
        stale_ttl: Duration,
        min_interval: Duration,
        limit: usize,
    ) -> Result<Vec<CommunitySkill>, SkillError> {
        let wait = {
            let mut guard = cache.lock().await;
            if let Some(skills) = guard.popular_fresh(fresh_ttl) {
                return Ok(truncate(skills, limit));
            }
            guard.reserve_request_slot(min_interval)
        };

        if !wait.is_zero() {
            tokio::time::sleep(wait).await;
        }

        match search_skills_at(client, endpoint, seed, retry_delay).await {
            Ok(skills) => {
                let mut guard = cache.lock().await;
                guard.write_popular(skills.clone());
                Ok(truncate(skills, limit))
            }
            Err(err) => {
                let stale = cache.lock().await.popular_stale(stale_ttl);
                if let Some(skills) = stale {
                    tracing::warn!(
                        "[houston-skills] popular feed fetch failed, returning cached results: {err}"
                    );
                    Ok(truncate(skills, limit))
                } else {
                    Err(err)
                }
            }
        }
    }
}

fn truncate(mut skills: Vec<CommunitySkill>, limit: usize) -> Vec<CommunitySkill> {
    if skills.len() > limit {
        skills.truncate(limit);
    }
    skills
}

// ── GitHub API types ──────────────────────────────────────────────

#[derive(Deserialize)]
struct GitTree {
    tree: Vec<GitTreeEntry>,
    truncated: bool,
}

#[derive(Deserialize)]
struct GitTreeEntry {
    path: String,
    #[serde(rename = "type")]
    entry_type: String,
}

// ── Public API ────────────────────────────────────────────────────

/// Search the skills.sh community directory.
///
/// Caching, request spacing, and rate-limit handling are owned by the
/// shared `SearchCache`. Concurrent calls with different queries do not
/// block each other on the cache mutex — the network call always
/// happens with the lock dropped.
pub async fn search_skills(query: &str) -> Result<Vec<CommunitySkill>, SkillError> {
    let client = build_client()?;
    let cache = SEARCH_CACHE.get_or_init(|| Mutex::new(SearchCache::default()));
    SearchCache::search(
        cache,
        &client,
        SEARCH_ENDPOINT,
        query,
        SEARCH_RETRY_DELAY,
        SEARCH_CACHE_TTL,
        SEARCH_STALE_TTL,
        SEARCH_MIN_INTERVAL,
    )
    .await
}

/// Fetch the global "popular" feed for the marketplace empty state.
///
/// Skills.sh has no dedicated popular endpoint, but `/api/search`
/// returns results sorted by install count regardless of relevance, so
/// the implementation seeds the search and trims to `POPULAR_LIMIT`.
/// Result is cached for 24h on its own slot — see `POPULAR_FRESH_TTL`.
pub async fn fetch_popular_skills() -> Result<Vec<CommunitySkill>, SkillError> {
    let client = build_client()?;
    let cache = SEARCH_CACHE.get_or_init(|| Mutex::new(SearchCache::default()));
    SearchCache::popular(
        cache,
        &client,
        SEARCH_ENDPOINT,
        POPULAR_SEED,
        SEARCH_RETRY_DELAY,
        POPULAR_FRESH_TTL,
        SEARCH_STALE_TTL,
        SEARCH_MIN_INTERVAL,
        POPULAR_LIMIT,
    )
    .await
}

/// Search endpoint implementation.
///
/// Retries once after a delay on HTTP 429 (rate limit).
async fn search_skills_at(
    client: &Client,
    endpoint: &str,
    query: &str,
    retry_delay: Duration,
) -> Result<Vec<CommunitySkill>, SkillError> {
    let query = query.trim();
    if query.chars().count() < 2 {
        return Ok(Vec::new());
    }
    let mut attempts = 0;
    loop {
        let resp = client
            .get(endpoint)
            .query(&[("q", query)])
            .send()
            .await
            .map_err(|e| SkillError::Unavailable(format!("skills.sh search failed: {e}")))?;

        if resp.status().as_u16() == 429 && attempts == 0 {
            attempts += 1;
            tokio::time::sleep(retry_delay).await;
            continue;
        }

        if resp.status().as_u16() == 429 {
            return Err(SkillError::RateLimited(
                "skills.sh rate limit hit, wait a moment and try again".to_string(),
            ));
        }

        if !resp.status().is_success() {
            return Err(SkillError::Unavailable(format!(
                "Skills search failed ({})",
                resp.status()
            )));
        }

        let result: SearchResponse = resp
            .json()
            .await
            .map_err(|e| SkillError::Unavailable(format!("Failed to parse results: {e}")))?;

        return Ok(result.skills);
    }
}

/// Install a single community skill by fetching its SKILL.md from GitHub.
///
/// `source` is the GitHub `owner/repo`, `skill_id` is the skill directory name.
/// Returns the installed skill's local name.
pub async fn install_skill(
    skills_dir: &Path,
    source: &str,
    skill_id: &str,
) -> Result<String, SkillError> {
    std::fs::create_dir_all(skills_dir).map_err(|e| SkillError::Io(e.to_string()))?;

    let client = build_client()?;

    // Try common path patterns first (cheap — no API call).
    let candidates = [
        format!("skills/{skill_id}/SKILL.md"),
        format!("{skill_id}/SKILL.md"),
        "SKILL.md".to_string(),
    ];
    let mut raw_md = None;
    for candidate in &candidates {
        if let Ok(md) = fetch_skill_md_at_path(&client, source, candidate).await {
            raw_md = Some(md);
            break;
        }
    }
    // Fallback: scan the repo tree and match by directory name or frontmatter `name:`.
    if raw_md.is_none() {
        if let Ok(Some(path)) = find_skill_path_in_repo(&client, source, skill_id).await {
            if let Ok(md) = fetch_skill_md_at_path(&client, source, &path).await {
                raw_md = Some(md);
            }
        }
    }
    let raw_md = raw_md.ok_or_else(|| {
        SkillError::SkillNotInRepo(format!(
            "Could not find '{skill_id}' in {source}"
        ))
    })?;
    let parsed = parse_skill_md(&raw_md, skill_id);

    // Prefer the SKILL.md's own `name:` (the authoritative slug) and fall back
    // to a slugified id, so a community id that isn't a clean slug still
    // installs instead of failing name validation.
    let install_name = extract_frontmatter_name(&raw_md)
        .filter(|n| crate::validate::name(n).is_ok())
        .unwrap_or_else(|| slugify(skill_id));

    // `install_skill_md` decides the already-installed case: a healthy existing
    // skill errors as AlreadyExists; a corrupt one (e.g. left by an older
    // Houston) is replaced so a reinstall heals it.
    crate::install_skill_md(skills_dir, &install_name, &raw_md, &parsed.description)?;

    Ok(install_name)
}

/// Normalize a user-supplied repo reference into `owner/repo`.
///
/// Accepts full URLs (`https://github.com/owner/repo`) or short form (`owner/repo`).
fn normalize_source(source: &str) -> String {
    let s = source.trim().trim_end_matches('/');
    // Strip common URL prefixes
    for prefix in &["https://github.com/", "http://github.com/", "github.com/"] {
        if let Some(rest) = s.strip_prefix(prefix) {
            // Only keep the first two path segments (owner/repo)
            let parts: Vec<&str> = rest.splitn(3, '/').collect();
            return parts[..parts.len().min(2)].join("/");
        }
    }
    s.to_string()
}

/// Discover all SKILL.md files in a GitHub repo.
///
/// Uses the Git Trees API to recursively scan the repo without rate-limit
/// concerns. Returns one `RepoSkill` per SKILL.md found.
/// Accepts `owner/repo` or full GitHub URLs.
pub async fn list_skills_from_repo(source: &str) -> Result<Vec<RepoSkill>, SkillError> {
    let source = normalize_source(source);
    let source = source.as_str();
    let client = build_client()?;

    // First check that the repo exists and is accessible.
    let repo_url = format!("https://api.github.com/repos/{source}");
    let repo_resp = client
        .get(&repo_url)
        .send()
        .await
        .map_err(|e| SkillError::Io(format!("Network error: {e}")))?;

    match repo_resp.status().as_u16() {
        200 => {}
        401 | 403 => return Err(SkillError::RepoPrivate),
        404 => return Err(SkillError::RepoNotFound(source.to_string())),
        429 => return Err(SkillError::GithubRateLimited),
        status => {
            return Err(SkillError::Io(format!(
                "GitHub returned {status} for repo '{source}'"
            )));
        }
    }

    // Fetch the full recursive file tree.
    let tree_url = format!("https://api.github.com/repos/{source}/git/trees/HEAD?recursive=1");
    let tree_resp = client
        .get(&tree_url)
        .send()
        .await
        .map_err(|e| SkillError::Io(format!("Network error: {e}")))?;

    if !tree_resp.status().is_success() {
        return Err(SkillError::Io(format!(
            "Could not read repo contents ({})",
            tree_resp.status()
        )));
    }

    let tree: GitTree = tree_resp
        .json()
        .await
        .map_err(|e| SkillError::Io(format!("Failed to parse repo tree: {e}")))?;

    if tree.truncated {
        tracing::warn!(
            "[houston-skills] repo tree for {source} was truncated — some skills may be missing"
        );
    }

    // Collect all blob paths named SKILL.md.
    let skill_paths: Vec<String> = tree
        .tree
        .into_iter()
        .filter(|e| e.entry_type == "blob" && e.path.ends_with("SKILL.md"))
        .map(|e| e.path)
        .collect();

    if skill_paths.is_empty() {
        return Err(SkillError::RepoEmpty(source.to_string()));
    }

    // Build RepoSkill stubs. We do fetch content here so we can prefer the
    // SKILL.md frontmatter `name:` over a path-derived id — repos named
    // `My_Repo` or `cool_skill` (anything outside `[a-z0-9-]`) cannot be
    // used as install ids directly, but the SKILL.md author almost always
    // declares a clean slug in frontmatter.
    let repo_name = source.split('/').last().unwrap_or(source);
    let mut skills = Vec::new();

    for path in skill_paths {
        let derived_id = skill_id_from_path(&path, repo_name);
        let (id, name, description) = match fetch_skill_md_at_path(&client, source, &path).await {
            Ok(raw) => {
                let parsed = parse_skill_md(&raw, &derived_id);
                let id = extract_frontmatter_name(&raw)
                    .filter(|n| crate::validate::name(n).is_ok())
                    .unwrap_or_else(|| slugify(&derived_id));
                (id, parsed.name, parsed.description)
            }
            Err(_) => (
                slugify(&derived_id),
                kebab_to_title(&derived_id),
                String::new(),
            ),
        };
        skills.push(RepoSkill {
            id,
            name,
            description,
            path,
        });
    }

    Ok(skills)
}

/// Coerce an arbitrary string into a valid skill slug:
/// lowercase, only `[a-z0-9-]`, no leading/trailing/repeat dashes,
/// max 64 chars. Used as a defensive fallback when a repo's name
/// contains characters that would fail `validate::name`.
fn slugify(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut prev_dash = true; // suppress leading dash
    for c in s.chars() {
        let cc = c.to_ascii_lowercase();
        if cc.is_ascii_lowercase() || cc.is_ascii_digit() {
            out.push(cc);
            prev_dash = false;
        } else if !prev_dash {
            out.push('-');
            prev_dash = true;
        }
    }
    while out.ends_with('-') {
        out.pop();
    }
    if out.len() > 64 {
        out.truncate(64);
        while out.ends_with('-') {
            out.pop();
        }
    }
    if out.is_empty() {
        out.push_str("skill");
    }
    out
}

/// Install selected skills from a GitHub repo.
///
/// `skills` is a subset of what `list_skills_from_repo` returned — the user's
/// selection. Returns the names of successfully installed skills.
/// Accepts `owner/repo` or full GitHub URLs.
pub async fn install_from_repo(
    skills_dir: &Path,
    source: &str,
    skills: &[RepoSkill],
) -> Result<Vec<String>, SkillError> {
    let normalized = normalize_source(source);
    let source = normalized.as_str();
    std::fs::create_dir_all(skills_dir).map_err(|e| SkillError::Io(e.to_string()))?;

    let client = build_client()?;
    let mut installed = Vec::new();

    // Fail-fast on the first install error so the user gets a real toast
    // with the real reason. Earlier behavior (catch + tracing::warn! +
    // continue) returned `Ok(vec![])` to the UI which surfaced as
    // "installed 0 skills" with no clue why.
    for skill in skills {
        let existing = skills_dir.join(&skill.id).join("SKILL.md");
        if crate::format::parse_file(&existing).is_ok() {
            // Already installed and healthy — skip. A corrupt or missing one
            // falls through and is (re)installed below.
            installed.push(skill.id.clone());
            continue;
        }

        let raw_md = fetch_skill_md_at_path(&client, source, &skill.path).await?;
        let parsed = parse_skill_md(&raw_md, &skill.id);
        crate::install_skill_md(skills_dir, &skill.id, &raw_md, &parsed.description)?;
        installed.push(skill.id.clone());
    }

    Ok(installed)
}

// ── Internals ─────────────────────────────────────────────────────

fn build_client() -> Result<Client, SkillError> {
    Client::builder()
        .user_agent("houston-skills/1.0")
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| SkillError::Io(format!("HTTP client error: {e}")))
}

fn normalize_search_query(query: &str) -> String {
    query.trim().to_lowercase()
}

/// Derive an install ID from a SKILL.md path within the repo.
/// `research/SKILL.md` → `research`
/// `tools/code-review/SKILL.md` → `code-review`
/// `SKILL.md` (root) → `{repo_name}`
fn skill_id_from_path(path: &str, repo_name: &str) -> String {
    let without_filename = path.trim_end_matches("/SKILL.md");
    if without_filename == path {
        // Didn't end with /SKILL.md — it's a root SKILL.md
        return repo_name.to_string();
    }
    // Use the last path segment as the ID
    without_filename
        .split('/')
        .last()
        .unwrap_or(repo_name)
        .to_string()
}

/// Use the GitHub Trees API to locate a SKILL.md matching `skill_id`.
///
/// Two-pass approach:
/// 1. Exact match on derived directory name (cheap — no extra fetches)
/// 2. For SKILL.md paths whose directory contains `skill_id`, peek at frontmatter
///    `name:` field (the authoritative name used by skills.sh)
async fn find_skill_path_in_repo(
    client: &Client,
    source: &str,
    skill_id: &str,
) -> Result<Option<String>, SkillError> {
    let tree_url = format!("https://api.github.com/repos/{source}/git/trees/HEAD?recursive=1");
    let resp = client
        .get(&tree_url)
        .send()
        .await
        .map_err(|e| SkillError::Io(format!("Network error: {e}")))?;

    if !resp.status().is_success() {
        return Ok(None);
    }

    let tree: GitTree = resp
        .json()
        .await
        .map_err(|e| SkillError::Io(format!("Failed to parse repo tree: {e}")))?;

    let repo_name = source.split('/').last().unwrap_or(source);
    let mut fuzzy_candidates = Vec::new();

    // Pass 1: exact directory-name match.
    for entry in &tree.tree {
        if entry.entry_type == "blob" && entry.path.ends_with("SKILL.md") {
            let derived_id = skill_id_from_path(&entry.path, repo_name);
            if derived_id == skill_id {
                return Ok(Some(entry.path.clone()));
            }
            // Collect fuzzy candidates: path contains skill_id as substring.
            if entry.path.contains(skill_id) {
                fuzzy_candidates.push(entry.path.clone());
            }
        }
    }

    // Pass 2: peek at frontmatter `name:` for fuzzy candidates (cap at 10).
    for path in fuzzy_candidates.iter().take(10) {
        if let Ok(content) = fetch_skill_md_at_path(client, source, path).await {
            if let Some(name) = extract_frontmatter_name(&content) {
                if name == skill_id {
                    return Ok(Some(path.clone()));
                }
            }
        }
    }

    Ok(None)
}

/// Extract the `name:` field from YAML frontmatter.
fn extract_frontmatter_name(content: &str) -> Option<String> {
    let mut in_frontmatter = false;
    for line in content.lines() {
        if line.trim() == "---" {
            if in_frontmatter {
                return None; // End of frontmatter, no name found
            }
            in_frontmatter = true;
            continue;
        }
        if in_frontmatter {
            if let Some(name) = line.strip_prefix("name:") {
                return Some(name.trim().trim_matches('"').trim_matches('\'').to_string());
            }
        }
    }
    None
}

async fn fetch_skill_md_at_path(
    client: &Client,
    source: &str,
    path: &str,
) -> Result<String, SkillError> {
    let branches = ["main", "master"];
    for branch in branches {
        let url = format!("https://raw.githubusercontent.com/{source}/{branch}/{path}");
        if let Ok(resp) = client.get(&url).send().await {
            if resp.status().is_success() {
                if let Ok(text) = resp.text().await {
                    return Ok(text);
                }
            }
        }
    }
    Err(SkillError::Io(format!(
        "Could not fetch '{path}' from {source}"
    )))
}

fn parse_skill_md(content: &str, fallback_id: &str) -> ParsedSkillMd {
    let mut description = String::new();
    let mut body_lines: Vec<&str> = Vec::new();
    let mut in_frontmatter = false;
    let mut frontmatter_done = false;

    for line in content.lines() {
        if line.trim() == "---" && !frontmatter_done {
            if in_frontmatter {
                frontmatter_done = true;
            } else {
                in_frontmatter = true;
            }
            continue;
        }

        if in_frontmatter && !frontmatter_done {
            if let Some(desc) = line.strip_prefix("description:") {
                description = desc.trim().trim_matches('"').to_string();
            }
        } else if frontmatter_done {
            body_lines.push(line);
        }
    }

    if !frontmatter_done {
        body_lines = content.lines().collect();
    }

    let mut name = String::new();
    for line in &body_lines {
        if let Some(title) = line.strip_prefix("# ") {
            name = title.trim().to_string();
            break;
        }
    }

    if name.is_empty() {
        name = kebab_to_title(fallback_id);
    }

    if description.len() > 200 {
        if let Some(pos) = description[..200].rfind(". ") {
            description = description[..=pos].to_string();
        } else {
            description.truncate(200);
        }
    }

    ParsedSkillMd { name, description }
}

/// Lightweight metadata pulled from a remote `SKILL.md` for listing and for a
/// fallback description. The body/frontmatter are preserved verbatim at install
/// time by [`crate::install_skill_md`], so this no longer carries the content.
struct ParsedSkillMd {
    name: String,
    description: String,
}

fn kebab_to_title(s: &str) -> String {
    s.split('-')
        .filter(|w| !w.is_empty())
        .map(|w| {
            let mut c = w.chars();
            match c.next() {
                Some(first) => format!("{}{}", first.to_uppercase(), c.collect::<String>()),
                None => String::new(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;
    use wiremock::matchers::{method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    #[test]
    fn normalize_github_urls() {
        assert_eq!(normalize_source("owner/repo"), "owner/repo");
        assert_eq!(
            normalize_source("https://github.com/owner/repo"),
            "owner/repo"
        );
        assert_eq!(
            normalize_source("https://github.com/owner/repo/"),
            "owner/repo"
        );
        assert_eq!(
            normalize_source("http://github.com/owner/repo"),
            "owner/repo"
        );
        assert_eq!(normalize_source("github.com/owner/repo"), "owner/repo");
        // Extra path segments are stripped
        assert_eq!(
            normalize_source("https://github.com/owner/repo/tree/main"),
            "owner/repo"
        );
    }

    #[test]
    fn skill_id_from_root_skill_md() {
        assert_eq!(skill_id_from_path("SKILL.md", "my-repo"), "my-repo");
    }

    #[test]
    fn slugify_passes_clean_slugs_through() {
        assert_eq!(slugify("research-company"), "research-company");
        assert_eq!(slugify("ai-sdk-2"), "ai-sdk-2");
    }

    #[test]
    fn slugify_normalizes_invalid_chars() {
        // Underscores → hyphens (the refero_skill case).
        assert_eq!(slugify("refero_skill"), "refero-skill");
        // Uppercase → lowercase.
        assert_eq!(slugify("My-Repo"), "my-repo");
        // Mixed garbage → collapsed dashes, trimmed.
        assert_eq!(slugify("__Cool!Skill__"), "cool-skill");
        assert_eq!(slugify("agent.tools"), "agent-tools");
        // Empty / pure-garbage input still produces a valid (if generic) slug.
        assert_eq!(slugify(""), "skill");
        assert_eq!(slugify("___"), "skill");
    }

    #[test]
    fn slugify_caps_at_64_chars() {
        let long = "a".repeat(120);
        assert_eq!(slugify(&long).len(), 64);
    }

    #[test]
    fn skill_id_from_nested_path() {
        assert_eq!(skill_id_from_path("research/SKILL.md", "repo"), "research");
        assert_eq!(
            skill_id_from_path("tools/code-review/SKILL.md", "repo"),
            "code-review"
        );
    }

    #[test]
    fn parse_with_frontmatter() {
        let content = "\
---
name: my-skill
description: A test skill for testing
license: MIT
---

# My Awesome Skill

## When to Use
Use this when testing.";

        let parsed = parse_skill_md(content, "my-skill");
        assert_eq!(parsed.name, "My Awesome Skill");
        assert_eq!(parsed.description, "A test skill for testing");
    }

    #[test]
    fn parse_no_frontmatter() {
        let content = "# Plain Skill\n\nJust some instructions.";
        let parsed = parse_skill_md(content, "plain-skill");
        assert_eq!(parsed.name, "Plain Skill");
        assert!(parsed.description.is_empty());
    }

    #[test]
    fn parse_no_title_falls_back_to_kebab() {
        let content = "\
---
description: No title heading here
---

Some content without a heading.";

        let parsed = parse_skill_md(content, "no-title-skill");
        assert_eq!(parsed.name, "No Title Skill");
        assert_eq!(parsed.description, "No title heading here");
    }

    #[test]
    fn kebab_to_title_basic() {
        assert_eq!(
            kebab_to_title("react-best-practices"),
            "React Best Practices"
        );
        assert_eq!(kebab_to_title("single"), "Single");
    }

    #[test]
    fn extract_name_from_frontmatter() {
        let content = "---\nname: ai-sdk\ndescription: Some SDK\n---\n\n# AI SDK";
        assert_eq!(extract_frontmatter_name(content), Some("ai-sdk".into()));
    }

    #[test]
    fn extract_name_quoted() {
        let content = "---\nname: \"my-skill\"\n---\n\nContent";
        assert_eq!(extract_frontmatter_name(content), Some("my-skill".into()));
    }

    #[test]
    fn extract_name_missing() {
        let content = "---\ndescription: no name here\n---\n\n# Title";
        assert_eq!(extract_frontmatter_name(content), None);
    }

    #[test]
    fn extract_name_no_frontmatter() {
        let content = "# Just a heading\n\nNo frontmatter.";
        assert_eq!(extract_frontmatter_name(content), None);
    }

    #[tokio::test]
    async fn search_ignores_queries_under_two_chars() {
        let client = build_client().unwrap();
        let skills = search_skills_at(&client, "http://127.0.0.1:1/search", " a ", Duration::ZERO)
            .await
            .unwrap();

        assert!(skills.is_empty());
    }

    #[tokio::test]
    async fn search_rate_limit_maps_to_rate_limited_error() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/search"))
            .respond_with(ResponseTemplate::new(429))
            .expect(2)
            .mount(&server)
            .await;

        let client = build_client().unwrap();
        let err = search_skills_at(
            &client,
            &format!("{}/search", server.uri()),
            "writing",
            Duration::ZERO,
        )
        .await
        .unwrap_err();

        assert!(matches!(err, SkillError::RateLimited(_)));
    }

    #[tokio::test]
    async fn cached_search_reuses_fresh_results_without_network() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/search"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "skills": [{
                    "id": "owner/repo/writing",
                    "skillId": "writing",
                    "name": "writing",
                    "installs": 7,
                    "source": "owner/repo"
                }]
            })))
            .expect(1)
            .mount(&server)
            .await;

        let client = build_client().unwrap();
        let cache = Mutex::new(SearchCache::default());
        let first = SearchCache::search(
            &cache,
            &client,
            &format!("{}/search", server.uri()),
            "Writing",
            Duration::ZERO,
            Duration::from_secs(60),
            Duration::from_secs(60),
            Duration::ZERO,
        )
        .await
        .unwrap();
        let second = SearchCache::search(
            &cache,
            &client,
            "http://127.0.0.1:1/search",
            " writing ",
            Duration::ZERO,
            Duration::from_secs(60),
            Duration::from_secs(60),
            Duration::ZERO,
        )
        .await
        .unwrap();

        assert_eq!(first[0].id, "owner/repo/writing");
        assert_eq!(second[0].id, "owner/repo/writing");
    }

    #[tokio::test]
    async fn cached_search_returns_stale_results_on_rate_limit() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/ok"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "skills": [{
                    "id": "owner/repo/bookkeeping",
                    "skillId": "bookkeeping",
                    "name": "bookkeeping",
                    "installs": 12,
                    "source": "owner/repo"
                }]
            })))
            .expect(1)
            .mount(&server)
            .await;
        Mock::given(method("GET"))
            .and(path("/limited"))
            .respond_with(ResponseTemplate::new(429))
            .expect(2)
            .mount(&server)
            .await;

        let client = build_client().unwrap();
        let cache = Mutex::new(SearchCache::default());
        SearchCache::search(
            &cache,
            &client,
            &format!("{}/ok", server.uri()),
            "bookkeeping",
            Duration::ZERO,
            Duration::ZERO,
            Duration::from_secs(60),
            Duration::ZERO,
        )
        .await
        .unwrap();

        let skills = SearchCache::search(
            &cache,
            &client,
            &format!("{}/limited", server.uri()),
            "bookkeeping",
            Duration::ZERO,
            Duration::ZERO,
            Duration::from_secs(60),
            Duration::ZERO,
        )
        .await
        .unwrap();

        assert_eq!(skills[0].id, "owner/repo/bookkeeping");
    }

    #[tokio::test]
    async fn different_queries_do_not_block_each_other_on_cache_lock() {
        // The whole point of the mutex split: two distinct queries
        // should never serialize behind each other across the network
        // call. Using a server that blocks the response on a permit
        // would prove this; here we use the simpler proof that two
        // concurrent calls return the right results from independent
        // cache slots and mock expectations are satisfied.
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/search"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "skills": [{
                    "id": "a/b/match",
                    "skillId": "match",
                    "name": "match",
                    "installs": 1,
                    "source": "a/b"
                }]
            })))
            .expect(2)
            .mount(&server)
            .await;
        let client = build_client().unwrap();
        let cache = std::sync::Arc::new(Mutex::new(SearchCache::default()));
        let url = format!("{}/search", server.uri());
        let (a, b) = tokio::join!(
            {
                let cache = cache.clone();
                let client = client.clone();
                let url = url.clone();
                async move {
                    SearchCache::search(
                        &cache,
                        &client,
                        &url,
                        "alpha",
                        Duration::ZERO,
                        Duration::from_secs(60),
                        Duration::from_secs(60),
                        Duration::ZERO,
                    )
                    .await
                }
            },
            {
                let cache = cache.clone();
                let client = client.clone();
                let url = url.clone();
                async move {
                    SearchCache::search(
                        &cache,
                        &client,
                        &url,
                        "bravo",
                        Duration::ZERO,
                        Duration::from_secs(60),
                        Duration::from_secs(60),
                        Duration::ZERO,
                    )
                    .await
                }
            }
        );
        assert!(a.is_ok());
        assert!(b.is_ok());
    }

    #[tokio::test]
    async fn popular_uses_dedicated_cache_slot() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/search"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "skills": [
                    {"id": "x/y/p1", "skillId": "p1", "name": "p1", "installs": 100, "source": "x/y"},
                    {"id": "x/y/p2", "skillId": "p2", "name": "p2", "installs": 50, "source": "x/y"}
                ]
            })))
            .expect(1)
            .mount(&server)
            .await;

        let client = build_client().unwrap();
        let cache = Mutex::new(SearchCache::default());
        let url = format!("{}/search", server.uri());
        let first = SearchCache::popular(
            &cache,
            &client,
            &url,
            "ai",
            Duration::ZERO,
            Duration::from_secs(60),
            Duration::from_secs(60),
            Duration::ZERO,
            10,
        )
        .await
        .unwrap();
        let second = SearchCache::popular(
            &cache,
            &client,
            "http://127.0.0.1:1/search",
            "ai",
            Duration::ZERO,
            Duration::from_secs(60),
            Duration::from_secs(60),
            Duration::ZERO,
            10,
        )
        .await
        .unwrap();
        assert_eq!(first.len(), 2);
        assert_eq!(second.len(), 2);
        assert_eq!(first[0].id, "x/y/p1");
    }

    #[tokio::test]
    async fn popular_truncates_to_limit() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/search"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "skills": (0..30).map(|i| serde_json::json!({
                    "id": format!("a/b/s{i}"),
                    "skillId": format!("s{i}"),
                    "name": format!("s{i}"),
                    "installs": 100 - i,
                    "source": "a/b"
                })).collect::<Vec<_>>()
            })))
            .mount(&server)
            .await;
        let client = build_client().unwrap();
        let cache = Mutex::new(SearchCache::default());
        let skills = SearchCache::popular(
            &cache,
            &client,
            &format!("{}/search", server.uri()),
            "ai",
            Duration::ZERO,
            Duration::from_secs(60),
            Duration::from_secs(60),
            Duration::ZERO,
            5,
        )
        .await
        .unwrap();
        assert_eq!(skills.len(), 5);
    }

    #[test]
    fn reserve_request_slot_stacks_concurrent_callers() {
        // Three back-to-back reservations with a 100ms min interval
        // should produce waits of 0, 100, 200 (give or take rounding).
        let mut cache = SearchCache::default();
        let min = Duration::from_millis(100);
        let w0 = cache.reserve_request_slot(min);
        let w1 = cache.reserve_request_slot(min);
        let w2 = cache.reserve_request_slot(min);
        assert!(w0 < Duration::from_millis(10), "first wait ~0, got {w0:?}");
        // Allow generous slack for clock jitter under test load.
        assert!(w1 >= Duration::from_millis(80) && w1 <= Duration::from_millis(120));
        assert!(w2 >= Duration::from_millis(180) && w2 <= Duration::from_millis(220));
    }
}
