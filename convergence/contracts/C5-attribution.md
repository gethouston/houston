# C5 — Message attribution (multiplayer conversations)

Multiple users share one agent's conversations. Attribution must say who wrote
each user message — for humans reading the transcript AND for the model
(acting-on-behalf comprehension).

## Wire

- Message-send requests proxied by the gateway carry `x-houston-acting-as`
  (C2), whose payload includes `sub` and best-effort `name` (JWT
  `user_metadata.name` | `email` local part).
- The pod host stamps outgoing/persisted user messages with
  `author: { userId: string, name?: string }`. Single-user/local: author
  omitted entirely (wire-compatible; UI falls back to "You").
- v3 conversation entries + `@houston-ai/engine-client` `ChatMessage` gain
  optional `author`. Events carrying messages include it.

## Model framing

When a turn's message has an author AND the conversation has ≥2 distinct
authors in history, the runtime prefixes the user text with
`[From: <name>]\n` (name falls back to userId prefix). Never prefixed in
single-author conversations (keeps today's prompts byte-identical → no drift
for existing users, and the dual-profile parity test stays green).

## UI

Shared conversations render the author name (small label above user bubbles,
grouped like chat apps) only when a conversation has ≥2 distinct authors；
otherwise unchanged. The viewer's own messages show as today.
