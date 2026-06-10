-- Per-workspace hosting runtime for the per-turn Cloud Run migration.
--   gke      — legacy: one long-lived pod + PVC per agent (existing workspaces).
--   cloudrun — per-turn Cloud Run + GCS-prefix workspaces (new default once
--              CP_DEFAULT_RUNTIME=cloudrun; existing rows flip individually
--              after their PVC contents migrate to GCS).
-- Additive + idempotent: safe on the live database.
ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS runtime TEXT NOT NULL DEFAULT 'gke'
  CHECK (runtime IN ('gke', 'cloudrun'));
