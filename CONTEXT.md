# Houston

Houston is one TypeScript engine (the pi runtime behind the host) with one shared client behavior layer (`@houston/sdk`) bound by every surface (desktop, web). This glossary is the ubiquitous language for design conversations; it defines what things ARE, never how they are implemented.

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
The turn-lifecycle decisions applied when a message is sent. Queue-while-running belongs to the client's engine adapter; Autocompact and Provider switch belong to the runtime (ADR-0002). A surface supplies only genuine inputs (text, overrides).
_Avoid_: send flags, send options

**Provider switch**:
The runtime moving a conversation to a different provider mid-session, detected per turn from the persisted settings and announced with a boundary divider. Never staged or requested by the client.
_Avoid_: provider handoff (the deleted client-staged mechanism)

**Autocompact**:
The runtime's always-on decision to summarize and reseed a conversation before a turn when its context is nearly full. A guarantee owned where the ground truth lives (live token fill, active model window), never a user setting or a client flag.
_Avoid_: compaction flag

**Queue-while-running**:
Messages accepted while a turn is active, held by the engine adapter and flushed as one combined send when the turn settles.
_Avoid_: message buffer

**Board status**:
The handled-versus-error signal on an activity card, read alongside session status: needs_you means handled or needs attention (a user Stop lands here); error means a genuine failure.
_Avoid_: card state

### Code execution

**Code sandbox**:
The disposable, egress-locked box where an agent's untrusted code runs — one request, one fresh working directory, wiped when the request returns. Never part of the agent's own process or pod.
_Avoid_: executor, code runner, REPL

**run_code**:
The agent's single way to compute or produce a file when it has no shell: it ships a program plus input files to the code sandbox and gets stdout, stderr and artifacts back. An artifact may only overwrite a file the agent declared as an input.
_Avoid_: execute tool, bash-over-HTTP

**code-run scope**:
The per-turn authority that lets a stateless worker reach the code sandbox — the gateway relays the run under the turn grant, so the worker itself holds no sandbox address or credential. A turn granted no such scope simply has no code execution, tool and system prompt alike.
_Avoid_: sandbox permission, code flag
