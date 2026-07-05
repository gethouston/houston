# Houston

Houston is one TypeScript engine (the pi runtime behind the host) with one shared client behavior layer (`@houston/sdk`) bound by every surface (desktop, web; mobile next). This glossary is the ubiquitous language for design conversations; it defines what things ARE, never how they are implemented.

## Language

### Turn lifecycle (client)

**Conversation VM**:
The reactive snapshot of one conversation — its feed, running flag, session status, and board status — published by the SDK. The only turn-state source a surface reads.
_Avoid_: feed store, session store, chat state

**Conversation scope**:
The identity a Conversation VM is published under: the (agent path, session key) pair. Session keys alone do not identify a conversation.
_Avoid_: session scope, channel

**Session key**:
The per-agent identifier of a conversation thread. Unique only within one agent.
_Avoid_: conversation id (that is the host's global identifier), session id

**Echo**:
The server's replay of the user's own message on the turn stream. Never rendered — the surface already showed the message optimistically at send.
_Avoid_: duplicate message

**Send policy**:
The turn-lifecycle decisions applied when a message is sent: Provider handoff, Autocompact, and Queue-while-running. Owned by the SDK; a surface supplies only genuine inputs (text, overrides).
_Avoid_: send flags, send options

**Provider handoff**:
A staged intent to switch providers mid-conversation. Consumed by the next send and cleared only when the engine confirms the switch; a failed switch stays staged and retries.
_Avoid_: provider switch (that is the engine's confirmation event)

**Autocompact**:
The always-on decision to summarize and reseed a conversation before a turn when its context is nearly full. A guarantee, not a user setting.
_Avoid_: compaction flag

**Queue-while-running**:
Messages accepted while a turn is active, held and flushed when the turn settles.
_Avoid_: message buffer

**Board status**:
The handled-versus-error signal on an activity card, read alongside session status: needs_you means handled or needs attention (a user Stop lands here); error means a genuine failure.
_Avoid_: card state
