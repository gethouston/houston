# C3 — Organizations, roles, assignments

## Storage: Supabase Postgres (gateway-owned schema `gateway`)

The k8s cluster remains the AGENT registry (pods/PVCs). Relational state lives
in Supabase Postgres, accessed by the gateway via `SUPABASE_DB_URL` (pooled,
service credentials; a k8s Secret). All access behind a `GatewayStore` port
with an in-memory fake (dev mode + tests) — same pattern as existing ports.

```sql
create schema if not exists gateway;

create table gateway.organizations (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique,          -- k8s-safe, gateway-minted (16 hex)
  name       text not null,
  personal_of uuid null unique,             -- auth.users.id for auto personal orgs
  created_at timestamptz not null default now()
);

create table gateway.org_members (
  org_id     uuid not null references gateway.organizations(id) on delete cascade,
  user_id    uuid not null,                 -- auth.users.id (JWT sub)
  role       text not null check (role in ('owner','admin','user')),
  added_by   uuid null,
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

create table gateway.agent_assignments (
  org_id     uuid not null references gateway.organizations(id) on delete cascade,
  agent_slug text not null,                 -- k8s AgentSlug
  user_id    uuid not null,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  primary key (org_id, agent_slug, user_id)
);

create table gateway.toolkit_grants (
  org_id     uuid not null references gateway.organizations(id) on delete cascade,
  agent_slug text not null,
  user_id    uuid not null,
  toolkits   text[] not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (org_id, agent_slug, user_id)
);
```

Migrations: plain SQL files in `db/migrations/NNN_*.sql` + a tiny idempotent
runner invoked at gateway boot (advisory-lock guarded).

## Personal-org bootstrap

On a verified request from a user with no membership: create
`organizations(personal_of=sub, name=email-localpart)` + `org_members(owner)`.
Idempotent (unique `personal_of`). Existing per-user namespaces map to the
personal org (see CL-E migration).

## Namespaces

One namespace per ORG: `houston-o-<orgSlug>`. Pod token becomes
`hostTokenFor(orgSlug, agentSlug)` — re-keyed from per-user. v1: every user
acts in EXACTLY ONE org (their personal org, or the one they were added to —
membership in multiple orgs is out of scope for v1; adding a user who already
belongs to another org is a 409 for now).

## Role matrix (enforced ONLY at the gateway)

| Capability | owner | admin | user |
|---|---|---|---|
| List agents | all org agents | all org agents | assigned only |
| Use agent (proxy any `/agents/:slug/*`) | any org agent | assigned only | assigned only |
| Create agent (`POST /agents`) | ✓ | ✓ | ✗ 403 |
| Rename/delete agent | ✓ | assigned only | ✗ |
| Assign/unassign agent to member | ✓ (any agent) | agents they're assigned to | ✗ |
| Add/remove member, change role | ✓ | ✗ | ✗ |
| Read own integration grants / connections | ✓ | ✓ | ✓ |
| Edit own grants for an agent | assigned* | assigned | assigned |

*Owners and admins are auto-assigned to agents they create (an
`agent_assignments` row written at create time). Owner "any agent" powers are
role-based, but grants still require an assignment row (self-assign is one
call away for an owner).

## New/changed gateway routes

- `GET /v1/org` → `{id, slug, name, role, members?: [{userId, email?, role}]}`
  (members only for owner/admin).
- `POST /v1/org/members` `{email, role}` — owner only; resolves email →
  auth.users via Supabase admin API; 404 if no such account (v1: no email
  invites). `DELETE /v1/org/members/:userId`, `PATCH …/:userId {role}` — owner.
- `GET /agents` — filtered per matrix; each item gains
  `assignedUserIds: string[]` (owner/admin only) and `assigned: boolean`.
- `PUT /agents/:slug/assignments` `{userIds: string[]}` — owner, or admin
  assigned to that agent. Emits `AgentsChanged` to every affected member's
  event stream.
- `/v1/capabilities` gains `multiplayer: true` and `role: "owner"|"admin"|"user"`.

## Frontend gating

All multiplayer UI gates on `capabilities.multiplayer`; role read from
capabilities. OSS/self-host never sees any of it.
