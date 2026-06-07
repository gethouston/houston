# OpenRouter manual QA checklist

Operator-run acceptance for the OpenRouter provider subscription feature.
Derived from `cloud/openrouter-provider-feature.json` → `manualAcceptance`.

**Prerequisites:** Houston desktop build with OpenRouter wired (p1–p5 complete).
Real OpenRouter API key from https://openrouter.ai/keys. Do not commit keys or
paste them into tickets.

**Evidence:** For each step, record pass/fail, date, operator initials, and a
one-line note (redact any key material). Attach screenshots or log excerpts when
useful.

| # | Step | Status | Operator | Date | Notes |
|---|------|--------|----------|------|-------|
| 1 | Connect OpenRouter with a real API key. | pending | | | Settings or provider picker → paste key → status shows connected. |
| 2 | Select an OpenRouter model for an agent. | pending | | | Model selector shows OpenRouter models; choice persists in agent config. |
| 3 | Send a normal chat message. | pending | | | Assistant reply streams; no provider mislabel in errors. |
| 4 | Run one flow that touches a file or tool. | pending | | | e.g. ask agent to read/write a project file or invoke a tool. |
| 5 | Invalidate the key and confirm Unauthenticated provider=openrouter. | pending | | | Replace stored key with bogus value or revoke at OpenRouter; error card shows `openrouter`, not `openai`. |
| 6 | Disconnect OpenRouter and confirm reconnect UI appears. | pending | | | `POST /v1/providers/openrouter/logout` or settings disconnect; picker prompts reconnect. |
| 7 | Switch back to Claude/OpenAI/Gemini and confirm existing providers still work. | pending | | | Regression: connect, chat, or status check on at least one non-OpenRouter provider. |
| 8 | OpenRouter + Composio toolkit parity check. | pending | | | Agent on openrouter with Composio connected; prompt `composio search` then `composio execute` for a connected app; bash tool succeeds, same as Anthropic path. |

## Blocked / cannot run

If a step cannot be executed (missing credits, env-only key blocking disconnect,
platform without Codex bundle, etc.), mark the row **blocked**, state why, and
what evidence would unblock it. Do not mark the feature done without explicit
blocked proof.

## Related docs

- Spike / Codex contract: `cloud/openrouter-spike.md`
- Plan: `cloud/openrouter-provider-plan.md`
- KB: `knowledge-base/agent-manifest.md`, `auth.md`, `provider-errors.md`, `engine-protocol.md`
