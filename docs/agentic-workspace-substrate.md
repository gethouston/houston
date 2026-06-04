# Agentic Workspace Substrate — design arc

Status: **proposed** (design under review, nothing built). Owner: Carlos.
Rich presentation: [`agentic-workspace-substrate.html`](./agentic-workspace-substrate.html) (P18 — read this for diagrams).
Grounded by a 5-agent sweep over the bstack skills + Houston reuse surfaces (run `wf_55e0d214-f5e`).

Turns Houston's hidden bag-of-agents into a **user-visible, git-backed, bstack-governed**
workspace root that orchestrates multiple projects, runs agents in worktrees, and shares one
second-brain knowledge graph — by **providing the environment and installing skills**, not by
building engine features. Non-technical product stays intact by default; an advanced mode reveals
the substrate.

---

## 0. Locked decisions

1. **Invisible by default + advanced toggle.** Substrate runs underneath; non-technical voice +
   UI stay default. `advanced.developer_mode` reveals the raw substrate.
2. **Onboarding picks + names the root** (default `~/Houston`). `.houston` vs root split is §2.
3. **Project is first-class now.** Workspace → { Agents, Projects }, many-to-many.
4. **Full bstack — as environment + skills, NOT engine code** (§1, the reframe).
5. **Sessions are addressable nodes** the knowledge graph references both directions (§5).
6. **Bookkeeping + project management are agent jobs in-session**, never user chores.
7. **Opinionated governance** so Houston workspaces are autonomous-agentic natively.
8. Root-level + per-workspace shared context (both).
9. **Rich HTML** for presenting plans/deep work (this arc ships an `.html` companion).

---

## 1. The reframe — environment, not build (load-bearing)

> Houston provides the **environment**; **agents** do the work **in-session via skills**.

The grounding sweep confirmed: every capability the arc needs is already a shipped bstack skill
that runs entirely in-session. Houston's job is to make each agent's workspace root *look like a
bstack workspace* and **install the skill roster through the rail Houston already owns**. It must
NOT reimplement any of it.

| Houston PROVIDES (environment) | Houston BUILDS (irreducible glue) | AGENTS DO (in-session via skill) |
|---|---|---|
| Governance tree seeded at create: `CLAUDE.md`/`AGENTS.md`/`METALAYER.md` + `.control/{policy.yaml,rcs-parameters.toml,audit/}` + `roles/` | Idempotent **scaffold** step (keep-if-exists) in `houston-agent-files` + `agents_crud.rs::create` | `/autonomous` — the 21-reflex operating mode (the meaning of "autonomous by default") |
| `research/entities/` + `docs/{conversations,specs,handoffs}/` + `docs/knowledge-index.md` catalog stub, at the **workspace root** (not under `.houston/`) | **Skill provisioning** = ship the bstack roster as a bundled package on the existing Store `.agents/skills/*` rail | `/kg load` + `bookkeeping run\|index` (P6) — LLM-as-index over `research/entities/` |
| The bstack **skill roster** installed per agent (`.agents/skills/<name>/SKILL.md` + `.claude/skills` symlink + prompt roster) | **Worktree lifecycle** ops + janitor (`worktree.rs` exists; add cleanup + reactive surface) | `/persist` (P12), `/role-x` (P17), `/cross-review` (P20), `/p9` (P9), `/handoff`, `/dogfood` |
| Per-session **runtime env**: `BROOMVA_ROOT=<agent workspace>`, `git`/`gh`/`python3` on PATH, the hook scripts | **Addressable session URI** (the one net-new wire contract, §5) | `git`/`gh`/Linear-MCP calls directly for P3/P4/P5/P8/P10 |
| `git init` + `.gitignore` per workspace; worktrees real | **Reactivity** for new agent-written surfaces (mostly free — FilesChanged catch-all) | curate the graph, bridge sessions, run the PR pipeline — themselves |

**Do NOT build** (consensus across all 5 findings): no Rust/TS port of the bookkeeping pipeline,
kg loader, persist loop, role-x router, p9 watcher, or cross-review; no graph DB / embeddings /
typed-edge store / query DSL (LLM-as-index is the design); no engine hook-engine (it's Claude Code
`settings.json` + shell scripts); no bespoke autonomous orchestrator (`/autonomous` IS it); no
engine CI-watcher (that's not `houston-scheduler`); don't bundle the full 60-skill roster (only the
~16 required-compliance set + `autonomous`).

---

## 2. Two roots — the `.houston` vs user-root split

> **`~/.houston/` = how Houston runs. `~/Houston/` = what you + your agents make.**

| | System root `~/.houston/` (`home_dir`) | Workspace root `~/Houston/` (`docs_dir`) |
|---|---|---|
| Visibility / git | Hidden, never git | Visible in Finder, **git repo** |
| Holds | `engine.json`, `houston.db` (chat_feed + prefs), `logs/`, installed agent **definitions** (`agents/`), bundled CLIs, tunnel id, **new** `app-config.json` (root path + flags the boot reads) | Root governance, `research/entities/` second brain, `WORKSPACE.md`/`USER.md`, every `<Workspace>/<Agent>/`, every `<Project>/`, all deliverables + the skills/governance the agent runs |
| Rule | machine state, disposable | the user's work, precious, backup-able |

`research/entities/`, governance, and `docs/conversations/` live at the **workspace root**
(user-visible, git-trackable) — **never under `.houston/`** (that would hide them from the user and
from git, defeating the arc). Each `<Agent>/.houston/` stays a hidden data dir; volatile parts
(`sessions/`, `*.sid`, `*.invalid`, schemas) are git-ignored, meaningful parts (activity/routines/
learnings/config) committed.

---

## 3. Data model

### 3.1 Project (first-class, NEW)
```ts
interface Project { id: string; name: string; path: string;
  kind: "created" | "linked"; git: { enabled: boolean; remote?: string }; createdAt: string }
```
- Index: `<Workspace>/.houston/projects.json` (beside the existing `connections.json`), files-first + reactive.
- `created` = `git init` a subdir; `linked` = symlink an external repo in (reuse the dormant agent link-folder mechanism, lifted to project scope).
- Engine: `projects.rs` + routes `/v1/workspaces/:id/projects`. Git/worktree ops reuse `worktree.rs`.
- **Agent ↔ Project (many-to-many):** agent identity stays its own dir; *where it works per mission* is a project (or worktree), resolved via the **existing** `session.workingDirOverride`.

### 3.2 Governance scaffold (NEW, opinionated)
Idempotent seed at root + workspace create, from embedded bstack templates with `{{WORKSPACE_NAME}}`
substituted, **keep-if-exists** (user-data-shaped, follows `migrate_agent_data` contract):
`CLAUDE.md`, `AGENTS.md`, `METALAYER.md`, `.control/policy.yaml` (profile=autonomous; governance
paths stay `require_human` until L3 trust gates are CI-wired — no silent L3 auto-merge),
`.control/rcs-parameters.toml`, `.control/audit/`, `roles/_meta.md`, `.claude/settings.json` (hooks),
`.githooks/pre-commit` + `core.hooksPath`. **Plus the workspace-side hook scripts** (§6 risk).

### 3.3 Second brain (LLM-as-index)
Seed `research/entities/<type>/` (10-type taxonomy) + `docs/knowledge-index.md` stub (empty-but-valid
— `kg.py` errors if absent) + the uniform **frontmatter schema** carried across `.md` *and* `.html`
*and* sidecars (P18) + a handful of hand-authored starter entities. `kg` + `bookkeeping` skills
provisioned per agent. Agents query/curate in-session; Houston builds no pipeline.

### 3.4 Session URI (the one net-new contract)
`houston://workspace/<W>/agent/<A>/session/<session_key>` — keyed on stable `(session_key,
working_dir)`, NOT the volatile resume id. Minted from `conversations.rs`'s existing `session_key`,
exposed on the history route, injected into the session prompt via `build_agent_context`. §5.

### 3.5 Root context layer
`build_agent_context` gains a top layer, broad → narrow:
`product prompt → ROOT (governance + KG digest) → WORKSPACE (WORKSPACE.md/USER.md) → AGENT (CLAUDE.md/learnings/skills)`.

---

## 4. Git + worktrees
- **Per workspace:** `git --version` check → `git init` + seed `.gitignore` + initial commit. Git
  absent → degrade to no-git mode + a **toast** (no silent failure), never block.
- **Commit cadence:** mission boundaries (hook the existing `file_changes` before/after snapshot) +
  explicit "save a version." Not per-write. Presented invisibly as "Houston saved a version."
- **Worktrees:** mission on a git project optionally runs in `{project}-worktrees/houston/{mission}`
  via `workingDirOverride` (reuse `worktree.rs`); the engine already permits parallel worktrees,
  conflicts same-folder. **Janitor** (P8 squash-merge detection) prunes — mandatory for
  non-technical users or `*-worktrees/` orphans pile up.
- `.gitignore` seeds: `**/.houston/sessions/`, `**/*.sid`, `**/*.invalid`,
  `**/.houston/**/*.schema.json`, `*-worktrees/`, `logs/`, `.DS_Store`.

---

## 5. Session ↔ knowledge-graph referenceability (decision #1)

A Houston session is **already addressable**: `(agent_path, session_key)` (`conversations.rs`),
resume ids on disk (`.houston/sessions/<provider>/<session_key>.sid`), transcript in `chat_feed` with
an **existing FTS5 index** (`repo_search.rs`). So:
- **FORWARD (session is addressable):** Houston mints the `houston://` URI, exposes it on the history
  route, injects it into the session's own prompt → the agent knows its address. The conversation
  bridge skill writes `docs/conversations/<session_key>.md` carrying that URI in frontmatter → the
  session becomes a node.
- **BACKWARD (graph references session):** entities promoted in-session carry `sessions: [houston://…]`
  (entity→session); the session node lists `entities: [[slug]]` (session→entity). `/kg`'s catalog
  already turns these into `→`/`←` links; `chat_feed` FTS makes the body queryable. Session→artifact
  edges come free from `file_changes.rs`.

No DB graph layer, no embeddings — the URI is the join key, markdown frontmatter is the edge store,
the agent is the query engine. **Caveats:** routine sessions share one `session_key` across runs →
need a run discriminator; URI must survive resume/compaction; PII redaction stays on in the bridge.

---

## 6. The make-or-break risks (surfaced by the sweep)

1. **Path-assumption mismatch (the crux).** bstack skills hard-code `~/broomva/research/entities`,
   `~/.config/broomva`, `~/.claude/...`. Installed as-is they target the *wrong* root. Houston spawns
   the provider subprocess, so it sets `BROOMVA_ROOT=<agent workspace>` (+ CWD) per session —
   `kg.py`/`bookkeeping.py` honor it. Skill bodies still need light adaptation to the workspace-
   relative + `.agents/`/`.houston/` layout. **This is the make-or-break of the whole arc.**
2. **Workspace-side hook scripts gap.** `settings.json` references `$WORKSPACE/scripts/*-hook.sh` that
   are emitted by `control-metalayer-loop`'s bootstrap, **not shipped in bstack/scripts/**. Seed
   settings.json without seeding these → every hook 404s → the P1/P2/P6/P7 reflex layer silently
   no-ops. Houston must seed the scripts (or run the bootstrap).
3. **Runtime deps — bundled at install (resolved).** `python3` 3.11+ (tomllib + PyYAML), `git`,
   `gh`, `bash` 4+, `node`/`npx`. Houston **bundles + installs these at install time** so a bare
   fresh setup is ready; agents install further tools on demand. Touches `houston-cli-bundle` +
   `scripts/fetch-cli-deps.sh` + notarization + bundle size → foundation **F0**.
4. **Voice firewall.** Governance jargon / `Pn` / URIs / paths must never leak into non-technical
   chat. Governance is agent-facing; the user sees outcomes only. `developer_mode` relaxes the voice.
5. **Skill-picker naming.** bstack slugs (`kg`, `role-x`, `persist`) + em-dash descriptions read badly
   and violate i18n rules. Don't use `display_name` override (RULE 0 / schema forbids) — mark them
   non-`featured`/no-`category` so they stay out of the prominent picker, or humanize at packaging.
6. **Bundle vs fetch.** Companion skills are "checked, not bundled" (`npx skills add`). Houston is
   offline-first → **vendor the chosen SKILL.md bodies into `store/` at release** (deterministic),
   not runtime `install_from_repo` (network → violates no-silent-failure).
7. **Governance ownership / L3 churn.** Houston-seeded governance vs agent self-evolution (P16) can
   fight; the L3 churn budget + pre-commit rate gate could block early-setup edits. Idempotent
   keep-if-exists re-seed; treat governance as user-data-shaped.

---

## 7. The arc (foundations → capabilities → cross-cutting)

**Foundations** (enable everything):
- **F0 — Runtime bundling.** Bundle + install `python3`/`git`/`gh`/`bash`/`node` at Houston install
  time (fresh setup ready; agents extend on demand). Extends `houston-cli-bundle` +
  `fetch-cli-deps.sh`; notarize bundled binaries; per-arch. Prereq for F2. `[build][app]`
- **F1 — Visible git-backed root.** `docs_root` pref + `app-config.json` + boot wiring
  (`HOUSTON_DOCS` from pref, engine restart); onboarding root-pick (default `~/Houston`); `git init`
  + `.gitignore`; existing-user migration offer (reuse `migrate_legacy_docs_dir`). `[engine][app]`
- **F2 — Agent environment + skill rail (the make-or-break).** Guarantee runtime (`python3`/`git`/
  `gh`); set `BROOMVA_ROOT` + CWD per session; vendor + provision the bstack roster via the Store
  `.agents/skills/*` rail + `copy_missing_skill_dirs` to existing agents; seed hook scripts; adapt
  skill bodies to workspace-relative roots; voice firewall + `advanced.developer_mode`. `[engine][app]`

**Capabilities** (each shippable + tested):
- **C1 — Projects first-class.** `Project` entity + `projects.json` + `projects.rs` + routes;
  "Open existing folder"/"New project" in the switcher (the original ask); agent↔project via
  `workingDirOverride`. `[engine][ui][app]`
- **C2 — Worktrees + janitor.** worktree-per-mission; parallel missions; P8 cleanup; reactive UI. `[engine][app]`
- **C3 — Governance scaffold (opinionated, autonomous-native).** Idempotent seed of the governance
  tree + `prompt.rs` root layer; `/autonomous` as the default stance. `[engine][app]`
- **C4 — Second brain (LLM-as-index).** Seed `research/entities/` + catalog + frontmatter + starter
  entities; `kg`/`bookkeeping` provisioned (F2); reactivity free. `[engine][app]`
- **C5 — Session ↔ KG.** The `houston://` URI wire contract + history-route exposure + prompt
  injection; bridge writes session nodes; entity↔session backlinks. `[engine][app]`

**Cross-cutting:** voice firewall + `developer_mode` reveal; humanized skill picker; KB docs + i18n
(en/es/pt); per-surface advanced toggles; tests + dogfood receipts each phase.

---

## 8. Reuse map (precise — per RULE 0, wire what exists)

| Need | Existing surface |
|---|---|
| Skill provisioning | `engine/houston-skills/src/lib.rs` (CRUD, `build_skills_index`, `migrate_flat_files`), `engine-core/src/skills.rs` (`ensure_claude_symlink`, `install_from_repo`, `SkillsChanged`) |
| Ship roster to existing agents | `store/bundled.rs` (`sync_bundled_agent_instances`, `copy_missing_skill_dirs`, `.migrations.json`) |
| Governance/entities scaffold seam | `agents_crud.rs::create` (241-247 packaged-skill copy + seeds map ~277), `houston-agent-files/src/{lib,schemas}.rs` (embedded-asset seed) |
| Context injection | `agents/prompt.rs` (`seed_agent` role-file fan-out, `build_agent_context`) |
| Frontmatter tolerance | `houston-skills/src/format.rs` (serde_yml, unknown-key tolerant — bstack frontmatter parses as-is) |
| Session identity / transcript / search | `conversations.rs` (`session_key`), `sessions/history.rs`, `houston-db/repo_search.rs` (FTS5), `sessions/file_changes.rs` (session→artifact) |
| Worktrees | `engine/houston-engine-core/src/worktree.rs` (`houston/{name}` branches, `run_shell`) |
| Folder linking | `agents_crud.rs` symlink + `pickDirectory` (dormant `link-project`) |
| Run elsewhere | `session.workingDirOverride` (`tauriChat.send`) |
| Root relocation + migration | `docs_dir`/`HOUSTON_DOCS` knob + `migrate_legacy_docs_dir` |
| Reactivity | `houston-file-watcher` FilesChanged catch-all (already covers `research/entities/**` + catalog), `use-agent-invalidation.ts` |
| Advanced flags | `advanced.*` substrate (FLAG_REGISTRY → KV → FeatureGate → enforcement → KB → tests) |

---

## 9. Decisions — resolved (this round)

| # | Resolution |
|---|---|
| 1 Sessions | First-class addressable nodes; bridge → KG; URI referenceable both ways (§5). |
| 2 Bookkeeping/PM | Agent jobs in-session via skills; never a user chore. |
| 3 KG/index | LLM-as-index + filesystem/frontmatter core from day 1; **no engine pipeline**. |
| 4 Governance | Best practice — seed bstack governance tree as environment. |
| 5 Opinionated | profile=autonomous; `/autonomous` default; governance L3 stays `require_human`. |
| 6 Shared context | Root global + per-workspace local (both). |
| 7 Format | `/bstack` conventions; rich HTML for presenting to the user. |

## 10. Decisions — closed (this round)
1. Path fix: **`BROOMVA_ROOT` per session + minimal per-skill body adaptation** to workspace-relative roots.
2. Hook scripts: **seed Houston-authored equivalents** (deterministic, offline) — don't depend on `control-metalayer-loop` bootstrap.
3. Runtime: **bundle + install all needed deps at Houston install time** (fresh setup ready); agents install more on demand → foundation **F0**.
4. Roster: **install for every agent, suppress from the picker surface** (non-`featured`/no-`category`).
5. Templates: **Houston-tuned, voice-firewalled**.

All arc-level decisions are closed. Next: execute **F1** (numbered chunk plan tracked in chat / the worktree branch).
