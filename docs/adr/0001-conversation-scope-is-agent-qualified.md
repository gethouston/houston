# Conversation scope is the (agent path, session key) pair

Session keys are unique only within one agent, so a Conversation VM published under the session key alone can collide across agents — the SDK's own stream identity (`streamKey`) already uses the pair. We key the conversation scope by (agent path, session key), with the encoding owned by the SDK so callers never learn it, and amend `BRIDGE.md` before any native shell ships against the old `conversation/<id>` format.

## Considered Options

- **v3 conversation id as the scope** (matches BRIDGE.md's original `cv_42` example and the host's canonical identity): rejected because every desktop subscriber addresses conversations by (agent path, session key) and would need a key→id resolution first, and `.houston` data files persist `session_key` — adopting the id vocabulary is a separate, larger migration that stays open as a future additive move.
- **Caller-qualified keys** (callers pass an agent-qualified string): rejected — it moves the uniqueness invariant to every call site.
