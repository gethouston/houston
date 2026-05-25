# Feature flags

Houston's Advanced settings section exposes power-user capabilities as per-flag toggles. Each flag is an opt-in entitlement, persisted per-install via `/v1/preferences/:key`, and gated in the UI through a `useFeatureFlag` hook plus a `FeatureGate` component. Phase 0 ships the plumbing; phases 1-9 each add one flag plus its engine-side capability.

This doc is the rule reference. Read once, then add your entry to `app/src/lib/featureFlags.ts` and follow the established pattern.

## Substrate

| Piece | Path |
|------|------|
| Registry, helpers, migrations | [app/src/lib/featureFlags.ts](../app/src/lib/featureFlags.ts) |
| Resolution hook | [app/src/hooks/useFeatureFlag.ts](../app/src/hooks/useFeatureFlag.ts) |
| Gate component | [app/src/components/FeatureGate.tsx](../app/src/components/FeatureGate.tsx) |
| Settings section | [app/src/components/settings/sections/advanced.tsx](../app/src/components/settings/sections/advanced.tsx) |
| Storage | `/v1/preferences/:key` — same KV used by `theme`, `timezone`, etc. |
| Cross-tab invalidation | `HoustonEvent::PreferenceChanged` (engine → WS firehose → `use-agent-invalidation.ts`) |
| Migration runner | `runFlagMigrations()` called once from `useHoustonInit` |

## The 12 rules

1. **String-typed storage, centralized encoding.** The preferences route is string-only. Encode booleans as `"true"` / `"false"` strings via `flagToString` / `stringToFlag`. Three states matter: `true`, `false`, `null` (unset). Never compare raw strings inline.

2. **Two-level namespace, forever-API names.** `<category>.<feature_snake_case>` — e.g. `advanced.git_panel`. Once a key is in user preferences databases, renaming is a migration. `advanced.*` is the only category for now; `experiment.*`, `ops.*`, `workspace.<id>.*` are reserved for future use. Everything else flat (`theme`, `timezone`, `locale`) is legacy non-flag prefs.

3. **One registry file, one entry per flag.** Every flag has a `FlagDef` in `FLAG_REGISTRY`. No flag exists without an entry; no entry exists without a flag. The Settings UI iterates `Object.values(FLAG_REGISTRY)` — adding a flag is one-stop.

4. **Defaults live in the registry, never in storage.** If `stringToFlag(stored) === null`, fall through to `FLAG_REGISTRY[key].default`. Never auto-write a default on first read. When a flag graduates to default-on, you change the code default; users who explicitly chose `false` stay `false`; users who never touched the toggle get the new default automatically.

5. **Declare enforcement surface explicitly.** `FlagDef.enforcementSurface` is `"ui"`, `"engine"`, or `"both"`. UI-only flags don't burden the engine. Engine-enforced flags read the preference at the actual check point (not at startup) so a toggle takes effect immediately. The split keeps reviewers honest about where the security boundary lives.

6. **Soft hints over hard dependencies.** Never auto-flip another flag in response to a user toggle. Use the `recommends?: string[]` field to surface a soft hint in the description (e.g. "Recommended: also enable Claude hooks for reliable pre-action blocking"). Respect user agency.

7. **TanStack Query plus WS-event invalidation.** `useFeatureFlag` keys its query by `["preference", key]` with a 60s stale time. Local toggles invalidate after the PUT settles. Cross-tab and cross-client invalidation arrives via `PreferenceChanged` WS events handled in `use-agent-invalidation.ts`. Mobile companions get flag changes for free.

8. **Writes alert, reads degrade gracefully.** The PUT preference path surfaces failures as toasts with a Report-bug button (via the existing `call()` wrapper in `tauri.ts`). The GET read path tolerates failures silently — it falls back to the code default and logs to the frontend log. Matches Houston's beta-stage no-silent-failures policy on user-initiated actions.

9. **Declare `graduationTarget` at birth.** Every `FlagDef` ships with either a version string (e.g. `"0.7.0"` — the release that flips the default) or `"permanent"`. Quarterly review cross-references registry × adoption telemetry × target to decide promotions. The four statuses (`beta` / `stable` / `graduating` / `retiring`) trace the lifecycle.

10. **Migrations through `FLAG_MIGRATIONS`.** Renames and deletes are append-only entries in the migration log. `runFlagMigrations` runs once at boot from `useHoustonInit` and is idempotent — applying a `rename` whose `from` key is already absent is a no-op. Never lose user choices silently; copy `from` to `to` only when the new key is empty.

11. **Don't fingerprint with the flag-set.** If telemetry on toggle is wired (PostHog `feature_flag.toggled` with `{key, newValue, oldValue}`), emit only on user-initiated PUTs. Never include the full flag-set in analytics events, error reports, or bug-report payloads. Scrub.

12. **Five-layer resolution, dev layers stripped in prod.** `useFeatureFlag` walks: URL query (`?flag.<key>=on`) → `window.__HOUSTON_FLAGS_OVERRIDE__` → `localStorage["flag.<key>"]` → engine preference → registry default. Layers 1-3 are wrapped in `import.meta.env.DEV` so Vite tree-shakes them from production. Production users only see layers 4 and 5.

## Reserved namespaces

| Namespace | Purpose | Status |
|-----------|---------|--------|
| `advanced.*` | Permission toggles (this plan) | active |
| `experiment.*` | A/B testing exposure | reserved (no implementation yet) |
| `ops.*` | Kill switches / emergency flags | reserved |
| `workspace.<id>.*` | Per-workspace prefs (future) | reserved |
| (flat) | Legacy non-flag prefs (`theme`, `locale`, `timezone`, …) | active |

## Adding a flag (the procedure)

When you ship a new advanced capability:

1. **Append the `FlagDef`** to `FLAG_REGISTRY` in `app/src/lib/featureFlags.ts`:
   ```ts
   "advanced.git_panel": {
     key: "advanced.git_panel",
     category: "advanced",
     default: false,
     labelKey: "advanced.flags.gitPanel.label",
     descriptionKey: "advanced.flags.gitPanel.description",
     enforcementSurface: "ui",
     status: "beta",
     learnMoreSlug: "git-panel",
     since: "0.5.0",
     graduationTarget: "permanent",
   },
   ```

2. **Add locale strings** to `app/src/locales/{en,es,pt}/settings.json` under `advanced.flags.gitPanel.{label,description}`. All three languages, no em-dashes, neutral Latin-American Spanish, Brazilian Portuguese. `pnpm --filter houston-app check-locales` enforces parity.

3. **Gate the UI** with `<FeatureGate flag="advanced.git_panel">…</FeatureGate>` or `const enabled = useFeatureFlag("advanced.git_panel");` for the inject / replace patterns described in [docs/plans/2026-05-22-houston-advanced-settings.html](../../docs/plans/2026-05-22-houston-advanced-settings.html) §4.

4. **Write tests.** Unit tests for any new helper. Component test asserting the gated UI appears when the flag is on and stays hidden when off. Use `window.__HOUSTON_FLAGS_OVERRIDE__` in tests (DEV-only layer).

5. **Knowledge-base entry** at `knowledge-base/advanced-<learnMoreSlug>.md` documenting what the capability does and how it's enforced. The flag description ends with "(see docs)" so users can read the deeper write-up.

## Migration policy

When a flag is renamed: append a `{ type: "rename", from, to, since }` entry to `FLAG_MIGRATIONS`. Boot copies the old key's value to the new key (unless the new key is already set), then clears the old. Idempotent.

When a flag retires after graduation: append a `{ type: "delete", key, since }` entry. Boot clears the stored value so the registry can drop the entry.

Never edit an existing migration entry. Append-only. The migration log IS the audit trail.

## Graduation policy

Quarterly (or per-release for fast cycles):

1. Sort the registry by `since` ascending.
2. For each flag, pull telemetry: adoption rate, error rate, last-toggled timestamp.
3. Apply the promotion rules:
   - `beta` with stable adoption and zero errors → promote to `stable`.
   - `stable` whose `graduationTarget` is hit and ≥ 50% power-user adoption → flip default to true, status to `graduating`.
   - `stable` with zero adoption after six months → consider retire.
   - `graduating` for two-plus releases with no new opt-outs → promote to `retiring`.
   - `retiring` for one release with no objection → remove via `FLAG_MIGRATIONS`.

The four statuses (`beta` / `stable` / `graduating` / `retiring`) and the lifecycle path are codified in `FlagStatus` and `FlagDef.graduationTarget`. The review is the discipline; the registry is the surface that makes it easy.

## See also

- Plan: [docs/plans/2026-05-22-houston-advanced-settings.html](../../docs/plans/2026-05-22-houston-advanced-settings.html) — what each phase ships
- Design doc: [docs/plans/2026-05-22-feature-flag-design.html](../../docs/plans/2026-05-22-feature-flag-design.html) — the deeper why
- i18n discipline: [knowledge-base/i18n.md](i18n.md) — locale string conventions every flag PR must follow
