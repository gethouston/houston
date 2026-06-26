-- Per-user, per-provider integration credential ("Composio for you"). Each cloud
-- user brings their OWN free integration account; the control plane holds that
-- account key host-side and hands it back per request. It is NEVER served to the
-- agent runtime (execution proxies through the host), so a prompt-injected agent
-- reading env finds nothing — the same custody guarantee as the connect-once
-- subscription credential, but keyed per user rather than per workspace.
--
-- Without this table the cloud profile fell back to an in-memory store, so a
-- user's connected account evaporated on every replica restart. This is the
-- Pg-backed home that PgIntegrationCredentialStore reads/writes.
--
-- Additive only. The `data` column is the provider's opaque payload (Composio:
-- { apiKey, userId, orgId }); only that provider's adapter reads it.
CREATE TABLE IF NOT EXISTS public.integration_credentials (
  user_id    text  NOT NULL,
  provider   text  NOT NULL,           -- IntegrationProvider.id, e.g. 'composio'
  data       jsonb NOT NULL,           -- provider-defined opaque payload
  updated_at bigint NOT NULL,
  PRIMARY KEY (user_id, provider)
);
