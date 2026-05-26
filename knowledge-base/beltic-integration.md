# Beltic credentials integration — status + deploy dependencies

Houston ↔ Beltic verifiable-credentials integration. Identity credentials issued for the workspace owner, agent-authorization credentials issued per agent. Identity flow optionally attaches supporting evidence (passport scans, etc.) — those documents flow through Beltic's evidence service when reachable, or land as opaque `sha256:<hex>:...` refs as a fallback.

## Status

End-to-end Houston-side code shipped on branch `worktree-beltic-integration` (PR #278 on `gethouston/houston`). Compiles, typechecks, locales in sync, all Rust crates green.

| Layer | What | Where |
|---|---|---|
| Engine | `houston-beltic` crate: REST client, issuer, JWT-VC verifier (JWKS + Status List 2021), webhook verifier | `engine/houston-beltic/` |
| Engine | Credentials + identity routes + evidence persist route (mode 0600 local mirror) + did:jwk minting | `engine/houston-engine-server/src/routes/{credentials,identity}.rs` |
| Engine | `evidence_store` content-addressed writer + `agent_did` keypair persistence | `engine/houston-engine-core/src/credentials/` |
| UI | TS types + engine-client methods + TanStack Query hooks | `ui/engine-client/src/`, `app/src/hooks/queries/use-identity.ts` |
| App | Settings → Identity + Authorized agents sub-nav | `app/src/components/settings/sections/{identity,agents}.tsx` |
| App | Verify dialog with drag-drop + pre-select doc type + SHA-256 hashing | `app/src/components/settings/sections/verify-identity-dialog.tsx` |
| App | Mission Control "Verified by Beltic" tag on agent cards | `app/src/components/dashboard.tsx` |

## Wire format

The verify dialog's submit handler PREFERS `evidence:<id>` refs (Beltic-returned resource ids) and falls back to `sha256:<hex>:<doctype>:<urlencoded-filename>` when the engine's call to Beltic's `/v1/evidence` upload fails. Both formats survive on the Beltic side; the swap is automatic and transparent to the user.

```
sha256:<64-char hex>:<passport|drivers_license|national_id|residence_permit>:<urlencoded filename>
↓ (after Beltic deploy of /v1/evidence)
evidence:<ev_uuid>
```

## Deploy dependency

The `evidence:<id>` upgrade path is **blocked on Beltic-side deploy**:

- **PR series on `beltichq/platform`:**
  - [#179](https://github.com/beltichq/platform/pull/179) — Evidence Prisma model + S3 storage + JWT embedding + permission scope
  - [#180](https://github.com/beltichq/platform/pull/180) — Read endpoints (`GET /v1/evidence/:id`, `/:id/download`) + Console reveal UI + audit
  - [#183](https://github.com/beltichq/platform/pull/183) — Server-side credential-scoping for reveal sessions
  - [#184](https://github.com/beltichq/platform/pull/184) — Docs
  - [#185](https://github.com/beltichq/platform/pull/185) — Beltic-owned magic-link (SES + Postgres tokens) — replaces a prior WorkOS-backed approach
  - **Polish PR** — branded email, SES retry, audit emission on redeem, per-org branding

**What happens on each merge:**
1. **#179 → development → staging deploy**: `/v1/evidence` POST goes live. Houston's existing engine-side fallback (commit `d1555d0`) auto-upgrades to upload via Beltic and emit `evidence:<id>` refs. No Houston-side change needed.
2. **#180 → staging**: read endpoints come up. Console + Houston Identity panel start resolving evidence metadata via the new endpoints. Already wired.
3. **#183 → staging**: Houston's verify dialog and Identity panel become safe to use across multiple credentials — server-side credential-scoping prevents a leaked reveal token from reading sibling credentials.
4. **#185 → staging**: org admins can mint Beltic-hosted reveal links so end users see their own credentials without an API key.

**No Houston code changes are needed for any of the above.** The fallback strings (`sha256:`) keep working; Beltic-deployed endpoints just take over transparently.

## Manual test paths

After Beltic deploys reach staging (`api.staging.beltic.com`), exercise:

1. Settings → Identity → Verify identity → drop a PDF → submit
2. Inspect the resulting credential row's `evidence_refs[]` — should contain `evidence:ev_...` (was `sha256:...` before the deploy)
3. Settings → Authorized agents → authorize → confirm `~/.houston/workspaces/<W>/<Agent>/.houston/agent_did/agent_did.json` exists, mode 0600
4. (Once #185 ships to staging) Org admin endpoint can mint a reveal-link to email the credential subject

## Staging key

Dev injects a baked-in staging key via `cfg!(debug_assertions)` block in `app/src-tauri/src/lib.rs`. Release builds strip the key — production reads `BELTIC_API_KEY` from the user's env or Keychain. See `engine/houston-beltic/src/config.rs::Configuration` for env-var resolution order.
