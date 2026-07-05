# The runtime owns send-time context management

Autocompact (summarize + reseed a near-full conversation before a turn) and mid-session provider switching are decided and executed by the runtime inside the turn (`exec-turn.ts`), not by the client. The runtime holds the ground truth — the session's live token fill and the active model's context window — so the decision lives there and every surface (desktop, web, routines, cloud) inherits it identically, with `context_compacted` / `provider_switched` boundary frames as the only client-visible trace.

## Considered Options

- **SDK-computed compact flag per send** (the design originally agreed for the VM-binding stage 2): rejected once we found the flag had been dead on the wire since the Rust cutover — the adapter dropped it and the runtime had no compact-on-request surface. Restoring it would have meant a new wire field plus injecting the model-window catalog into the client, to approximate numbers the runtime already has exactly.
- **Client-staged provider handoff** (`providerSwitch` on the send, staged in an app store, cleared on the confirmation frame): deleted rather than migrated — nothing staged it anymore, and the runtime re-resolves provider/model from settings on every turn, making the staged intent redundant.

## Consequences

Queue-while-running is the one send-time policy that stays client-side (the engine adapter holds and flushes it): it is composer UX — removable bubbles, combining several messages into one turn — not context management.
