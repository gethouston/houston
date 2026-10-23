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

> Superseded twice: by the Teams role matrix v2 (admins no longer see or
> manage every agent; per-agent `access` decides, see
> `app/src/lib/agent-access.ts`) and by matrix v3 below (the `partner`
> role). Kept as the v1 record.

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

## Matrix v3: Houston Partner (2026-10-23)

Proposal and reasoning: `docs/proposals/implementer-role-and-meta-posting.md`.
An agency that builds and runs AI Employees for a client becomes a **Houston
Partner**. Its people hold the `partner` org role inside the client's org; the
client's IT person stays `owner` (and billing owner). Wire shapes:
`OrgRole` (`packages/protocol/src/core.ts`, `packages/wire-types/src/types.ts`),
`Agent.managedBy` / `Agent.pause` (`packages/wire-types/src/agents.ts`) and the
refusals in `packages/wire-types/src/partner.ts`. The gateway serves none of it
yet; until it does, clients read every field as optional and treat `partner`
as no more than a `user` (fail-closed).

### Concepts

- **Partner**: an org member with role `partner`. Only an owner grants it. The
  grant's confirm step is the owner's one-time agreement to everything below,
  pausing included; there is no approval per pause. A partner is a normal paid
  seat (`seats = count(org_members)`).
- **Partner-managed agent** (`managedBy: "partner"`): set when a partner
  creates an agent in the org or moves one in. All of the org's partners manage
  it together (v1: one agency per org).
- **Pause** (`pause: {by, at, note?}`): a partner's switch on a managed agent.
  A paused agent refuses chat turns and routine runs with `409 agent_paused`
  (the body carries the `pause`); its data stays readable to whoever could read
  it before. Only a partner clears it. Independent of the billing lock: the
  agent runs only when neither is set.

### Matrix

Rows marked *managed* apply to partner-managed agents; every other agent keeps
matrix v2.

| Capability | owner | admin | partner | user |
|---|---|---|---|---|
| Add/remove members, change roles | ✓ | ✗ | ✗ | ✗ |
| Grant/revoke `partner` | ✓ | ✗ | ✗ | ✗ |
| Leave the org | ✓ (≥1 owner) | ✓ | ✓ | ✓ |
| Delete the org | ✓ | ✗ | ✗ | ✗ |
| Read billing / seats | ✓ | ✓ | ✗ | ✗ |
| Pay, change plan, portal | billing owner | ✗ | ✗ | ✗ |
| `move_out` during a billing lock | ✓ | ✓ | ✗ | ✗ |
| Create agents | ✓ | ✓ | ✓ (born managed) | ✗ |
| *managed*: use | if assigned | if assigned | ✓ | if assigned |
| *managed*: set assignments | ✓ | ✗ | ✓ | ✗ |
| *managed*: settings, instructions, skills, model, allowed apps | ✗ | ✗ | ✓ | ✗ |
| *managed*: read `CLAUDE.md` / skill files, portable export | ✗ | ✗ | ✓ | ✗ |
| *managed*: pause / resume | ✗ | ✗ | ✓ | ✗ |
| *managed*: release (clear `managedBy`) | ✗ | ✗ | ✓ | ✗ |
| *managed*: move out of the org | ✗ | ✗ | ✗ | ✗ |
| *managed*: delete | ✓ (paused or not) | ✗ | ✗ | ✗ |
| *managed*: read conversations | mission audience | mission audience | mission audience | mission audience |

Anything a non-partner may not do on a managed agent answers
`403 partner_managed`. Conversations follow the existing mission audience
(`packages/protocol/src/domain/mission-audience.ts`): a partner gets no
read-all. Removing the last partner (or a partner leaving) pauses every
managed agent and keeps it sealed; the client keeps its data, not the
configuration.

### Gateway duties (not built)

- Accept `partner` on `POST /v1/org/members`, `PATCH …/:userId` and invites;
  advertise `capabilities.role = "partner"`.
- Serve `managedBy` / `pause` on `GET /agents`; add pause, resume and release
  routes (each an `sdk` route with one SDK method, R1 to R5).
- Enforce the seal on the proxied agent paths (settings, skills, `CLAUDE.md`,
  `portable/export`) and admit no turn or routine on a paused agent.
- Hide billing from partners; drop `move_out` for them.
- Write every grant, pause, resume, release and removal to the org audit log.

### Policy, not enforcement

- Partners never connect a client's apps under their own login: client people
  connect their own (Composio `user_id` is per person, C1). Routines run on
  their creator's grants (C4), so a routine on a managed agent belongs to a
  client person; how a partner hands one over is open.
- The seal covers routes and files, not the conversation: an agent can still
  be asked to recite its instructions. Product prompt guidance lowers that;
  nothing removes it.
