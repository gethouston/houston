-- Connect-once: one AI subscription credential per workspace (the user's own
-- ChatGPT/Codex or Claude OAuth token), held centrally by the control plane and
-- refreshed in ONE place. Every agent sandbox in the workspace serves a fresh
-- access token from here per turn, so all of a user's agents share the same
-- connection and new agents work with no extra login. Centralizing the refresh
-- avoids the refresh-token-rotation conflict that independent per-agent copies hit.
--
-- Additive only. Tokens are the cloud user's OWN subscription tokens (not a
-- Houston key); access is gated by the control plane's DB credentials.
CREATE TABLE IF NOT EXISTS public.workspace_credentials (
  workspace_id  text   NOT NULL,
  provider      text   NOT NULL,           -- 'openai-codex' | 'anthropic'
  access_token  text   NOT NULL,
  refresh_token text   NOT NULL,
  account_id    text,                     -- ChatGPT account id (codex); null for providers without one
  -- Unix epoch milliseconds the access token expires; the control plane refreshes
  -- shortly before this and overwrites the row in place.
  expires_at    bigint NOT NULL,
  updated_at    bigint NOT NULL,
  PRIMARY KEY (workspace_id, provider)
);
