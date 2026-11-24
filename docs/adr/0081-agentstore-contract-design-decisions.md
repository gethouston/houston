# Agent Store contract: design decisions

Covers `packages/agentstore-contract/`: the Agent Store types, schemas and normalizers shared by the store, its worker and tooling.

## Dependency-light shared contract

`@houston/agentstore-contract` holds only types, zod schemas and pure helpers, with no database or cloud libraries, so the Next.js app, the Cloudflare Worker and tooling can all import it.

Lives in `packages/agentstore-contract/src/index.ts`.

## AgentIR 2.0.0 is the schema of record

AgentIR carries identity, the agent's CLAUDE.md as `instructions` (may be empty), skills as verbatim SKILL.md text (frontmatter plus body), learnings, expected Composio toolkits and provenance. It is validated before any version snapshot is stored. The version literal is pinned: a MINOR bump adds optional fields with no migration, a MAJOR bump prepends a step to `IR_MIGRATIONS`. Migrations run on read; v2.0.0 is the floor because v1 never shipped, so the chain is empty and `migrateAgentIr` is a validating passthrough.

Lives in `packages/agentstore-contract/src/ir.ts` (`AGENT_IR_VERSION`, `IR_MIGRATIONS`, `migrateAgentIr`).

## Hand-maintained JSON Schema

The public JSON Schema (Draft 2020-12) served at `GET /v1/agentstore/schema/agent` is written by hand, not converted from zod at runtime, so the wire contract never shifts with zod internals. A drift test compares its property keys against a fixture that sets every optional field. It must mirror zod rules exactly; for example URLs are https-only because `httpsUrl` rejects other protocols, and an agent building strictly against the schema would otherwise get a 422 at ingest. The prose is the agent-facing contract and must not point at removed paths.

Lives in `packages/agentstore-contract/src/json-schema.ts`, `json-schema.test.ts`, `__fixtures__/example-ir.ts`.

## Forgiving normalization before validation

Agents posting to the store do not follow the publish instructions perfectly, so `normalizeAgentIr` fills every field with a safe default before `agentIrSchema` runs, and only real problems reach validation. The stored snapshot is always a complete, valid AgentIR; forgiveness lives in the normalizer, never in the schema. Rules include: pin `irVersion`; slugify tags, drop empties and duplicates, cap at 6; inject the unclaimed creator placeholder when the creator is invalid; uppercase toolkit slugs and drop any still malformed; fall back to a constant slug when a name is entirely non-Latin or symbols (slugify yields ""), since the public share slug is assigned separately. When nothing can be backfilled the input passes through so validation reports the real error.

Lives in `packages/agentstore-contract/src/normalize.ts` (`normalizeAgentIr`).

## Unique suffixing trims the base

Deduplicating slugs and learning ids appends `-2`, `-3` and so on, trimming the base so the suffix survives the 64-character cap. Without the trim a 64-character base loops forever, because slicing `${base}-2` to 64 gives back `base`.

Lives in `normalize.ts` (`disambiguate`).

## Slug and frontmatter rules mirror the domain package

`slugify` uses the same rules as `@houston/domain` (lowercase, collapse non-`[a-z0-9]` runs to one hyphen, trim hyphens, cap at 64) so store ingest and the desktop skills library derive the same slugs. The SKILL.md frontmatter parser uses the same regex, `yaml` parser and string coercion as `parseSkillMd`. It reads display fields only and ignores frontmatter `name:`, so a drifting display phrase can never shadow the caller's slug.

Lives in `packages/agentstore-contract/src/slug.ts`, `skill-frontmatter.ts`.

## Handles mirror the Go rules

The creator handle grammar (2 to 30 characters, lowercase, alphanumeric start, then alphanumerics and underscores) and the reserved set are byte-for-byte copies of `cloud/internal/agentstore/profiles.go`. Input is normalized first (trim, strip one leading `@`, lowercase) and that normalized value is what is checked and sent.

Lives in `packages/agentstore-contract/src/handle.ts`.

## Install-from-link always fetches the gateway

A pasted share link or bare slug resolves to `<apiBase>/v1/agentstore/agents/<slug>`. Only the slug is taken from a pasted URL; the fetch never targets the pasted origin. Anything with a scheme is parsed as a URL, so a mistyped `http://` link is rejected instead of read as a slug. Loopback, private, single-label and IP literal hosts are refused.

Lives in `packages/agentstore-contract/src/store-link.ts`.

## Conservative credential scanner

The scanner blocks a publish or export when user-authored text plainly carries a credential. It matches only well-shaped, high-signal token formats so false positives stay near zero; the newer AI Studio key format varies in length, so it requires a long unbroken tail. Every excerpt is redacted (first 4 and last 2 characters, short matches fully masked) before it leaves the scanner, and findings are deduped by pattern plus excerpt. The scanned surface is instructions, identity name, tagline, description and tags, skill bodies and learnings.

Lives in `packages/agentstore-contract/src/secrets.ts`.
