# Phase 0 findings — pi SDK capability spikes

Verified against installed `@earendil-works/pi-ai` + `pi-coding-agent` **0.78.1** (`packages/runtime/node_modules`), 2026-06-12.

## 0a — Skills: GO, nearly free

pi natively implements the Agent Skills standard (`core/skills.d.ts`): `SKILL.md` folders, YAML frontmatter (`name`, `description`, extra keys tolerated via `[key: string]: unknown`), XML prompt injection (`formatSkillsForPrompt`, agentskills.io format). Discovery: dir with `SKILL.md` = skill root; direct `.md` children; recurse for `SKILL.md`.

Houston skills (`knowledge-base/skills.md`) are **already** `SKILL.md` + frontmatter under `.agents/skills/<slug>/`. Wiring: `DefaultResourceLoader` `additionalSkillPaths: [<agent>/.agents/skills]`, drop `noSkills: true` (`packages/runtime/src/session/resource-loader.ts:19`). Houston's extra frontmatter (category/featured/image/integrations) passes through untouched. The `.claude/skills` symlink layer dies with the CLIs.

## 0b — Gemini: NO-GO at cutover

`pi-ai` ships `google` + `google-vertex` providers (`dist/providers/google.js`, `KnownProvider` includes `"google"`). BUT OAuth flows are only `anthropic`, `openai-codex`, `github-copilot` (`dist/utils/oauth/`). **No Google OAuth** — Gemini works via API key only. Desktop Gemini today is OAuth (free tier, PKCE). Non-technical users don't paste API keys (voice rule). Decision: **drop Gemini at cutover**, announce before beta, revisit if pi adds Google OAuth.

## 0c — MCP / Composio: cut

Zero MCP references in pi-coding-agent 0.78.1 `.d.ts` surface. Extension points are `customTools` (in-process `defineTool`) + `extensionFactories`. Composio's CLI model died with the Rust engine; no MCP bridge exists. Decision: **cut Composio**, revisit as custom tools if usage data demands.

## 0d — Sidecar packaging: GO, one artifact

`bun build --compile src/main.ts` → **71.5 MB** arm64 binary, works (booted, served `/health`). vs Rust engine ~15 MB — real but acceptable regression. Strategy: ONE compiled artifact serving host + runtime modes (mode flag; host spawns itself as runtime subprocesses) so the installer grows by one binary. Windows compile+signing still unverified — P4 gate, not blocked yet.

## 0e — Runtime footprint: GO with lazy lifecycle

Idle RSS per runtime process: **139 MB** (server mode, no session). N standing processes is too heavy for laptops; lazy spawn on first message + idle-sleep (SIGTERM) keeps 0–2 awake typically. Confirms the launcher design (same ensureAwake/sleep verbs as cloud).

## 0f — History synthesis: GO, proven

`SessionManager.appendMessage()` accepts hand-built plain user/assistant messages; `continueRecent()` restores them in a fresh process — already pinned by `packages/runtime/src/session/resume.test.ts`. Rust `chat_feed` rows (user/assistant text pairs) synthesize directly. Tool-call/thinking blocks do NOT migrate (different engines) — transcripts stay visible, agent memory = plain-text pairs.

## Bonus findings

- **Context files: zero migration.** pi discovers `CLAUDE.md` natively (`resource-loader.js:30`, candidates `AGENTS.md`/`CLAUDE.md`). `GEMINI.md` symlink dies with the CLIs.
- **Product prompt injection point:** `SYSTEM.md` / `APPEND_SYSTEM.md` in `agentDir` (`resource-loader.js:669-684`) — the `HOUSTON_APP_SYSTEM_PROMPT` analog, plus `systemPrompt`/`appendSystemPrompt` loader options for env-driven injection.
- **Loader override hooks** (`skillsOverride`, `agentsFilesOverride`, `systemPromptOverride`...) give the host surgical control without forking the loader.
- Baseline: runtime tests 84/84 green at spike time.
