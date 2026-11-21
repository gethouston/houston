# Assistant catalog generator: design decisions

Covers `scripts/assistant-catalog/`: the generator that reads `@assistant` JSDoc from the engine adapter and SDK and writes the AI Manager's operation catalog, capability index and docs. Short file paths are relative to that folder.

## Purpose and gates

The generator reads the engine adapter and SDK sources and writes the AI Manager's operation catalog, the capability index and three human documents (coverage, operations, plus the provenance header). Two separate gates exist because they prove different things. `check:assistant-catalog` regenerates into a temporary tree and diffs against the committed copies, which only proves the outputs match the source. `check:assistant-coverage` (`check-assistant-coverage.ts`, `assistant-gate.ts`) is the build gate that every user-facing operation is either a properly annotated, routable tool or carries a written acknowledgement of why not. Without it, a silent `route: null` or a bare `hidden` drops an operation out of automation with nothing failing.

## Where outputs live

`assistantOutputs` in `assistant-paths.ts`: the catalog lands in the host package because the host imports it as a module, embedded at build time, so it travels inside both the container bundle and the Bun-compiled desktop sidecar with nothing to locate on disk. The capability index lands in domain for the same reason: the runtime folds it into the coordinator's system prompt. The human documents live under `docs/assistant/`. Every output carries one provenance sentence (`ASSISTANT_PROVENANCE`) naming every source the generator reads, so a reader editing an SDK module knows downstream files will move.

Each generated body is run through the repo's formatter (`format` in `generate-assistant-catalog.ts`) so the committed output is byte-identical to what `pnpm check` would rewrite; otherwise the drift check and the formatter disagree forever.

## Determinism

`hashSources` hashes every source the catalog is derived from, repo-relative path included, so any edit (comments too) is drift until regeneration.

`OperationAnnotation.location` (`file:line`) is used only by the coverage gate and is deliberately absent from the emitted catalog, because it moves with every edit above a declaration.

Members keyed by well-known symbols (`Symbol.iterator`) are skipped: their escaped names embed a per-checker id (`__@iterator@2256`) that changes between runs (`isSymbolNamed` in `assistant-schema.ts`).

Union literal branches are emitted in alphabetical order (`literalsInOrder`), because the checker orders union members by when each type was first created anywhere in the program, so an unrelated file could reorder the catalog.

Sources are sorted by path (`sourcesIn`, `sourcesUnder`).

## Document shapes have one declaration

The catalog document types are declared once in `@houston/domain`, which the host reads the file back through. `assistant-catalog-types.ts` only aliases them. A second writer-side copy would drift and surface only as a catalog the host silently refuses to load. The coverage-gate view of an operation is generator-only.

## Which sources are read

`assistant-paths.ts`: the control-plane modules that issue requests, the cluster mixins the app calls them through, and the whole SDK module tree with no per-file allowlist (a file whose functions never reach the wire contributes nothing; only tests are excluded because a fixture is not a surface). The SDK tree is last on purpose: names collide where the SDK implements writes the mixins delegate to, first source wins, so the control-plane copy stays canonical and the SDK contributes only operations nothing else implements. `cp/fetch.ts` is read only for shared path helpers such as `agentPath`. `sdk.ts` (the facade) and the runtime-client sub-clients are read to resolve requests, never to publish operations, and are hashed too, so a path moved inside a sub-client is drift.

## SDK facade walk

`assistant-module-surface.ts`, `assistant-facade-surface.ts`, `assistant-module-locals.ts`: SDK modules are factory closures whose methods have no exported names, so operations are found by walking the facade (`this.integrations = createIntegrationsModule(ctx)` in the `HoustonSdk` constructor; the property name is the dispatch namespace, not the directory name) and then the object each factory returns, following nested objects, sub-factory calls and destructured members. An operation is named by the path a caller types, such as `integrations.writes.disconnect`. Every factory reached this way is wiring, never an operation, and that set falls out of the walk so nothing has to be listed. The walk is depth-bounded (8). An overloaded function binds to its implementation because only that has a body. The JSDoc above a `const x = ...` statement is read from the statement, not the initializer. Cluster mixin class factories are not operations either (`isMixinFactory`), and `AdapterContext` is transport plumbing, never a caller parameter (`PLUMBING_TYPES`).

## Route derivation is conservative

`extractRoute` in `assistant-route.ts`: a declaration qualifies only when its body makes exactly one request at any nesting, through a direct transport call `(scope, path, init?)`, a private transport wrapper, or a runtime-client sub-client the module resolved. The path may be built only from literals, readable `const`s, `encodeURIComponent(param)`, the multi-segment escape idiom (`split("/").map(encodeURIComponent).join("/")`), caller-unreachable defaults and known path helpers (nesting bounded at 4). An unescaped interpolation is refused because the dispatcher escapes what it substitutes and the two must agree. Anything else yields `route: null` with a reason, never a guess. Direct call sites follow the transport contract, so a computed path there is a call site to fix.

The init object may hold only `method`, `body`, `signal` and a JSON content-type header (`extractInit`, `isJsonContentType`); any other key or a spread means the request is assembled conditionally.

Route first, schemas second (`readOperation`): a declaration that never reaches the wire is not an operation, and typing its parameters would file coverage gaps against a function the catalog does not contain. The route also identifies parameters (`/agents/{x}` says `x` is an agent).

Behind overloads, the published parameter list is the first overload (the caller's contract) while routing reads the implementation. A path parameter only the implementation names is a call nobody can make, so that route is dropped (`unpublishedPathParams`).

A default the caller cannot override (`opts?.provider ?? "composio"` with no `opts` parameter) is the path; once the caller can supply the value it is undecidable (`callerSupplied`, `resolveDefault`). A spread argument means every parameter from there on may be supplied. A destructured parameter bound to an opaque value records every field name, so no field reads as unsupplied. The same rule applies to conditional spreads in bodies (`spreadEntries`).

A local `const` shadows a module constant exactly as at runtime (`localInitializers`).

## Runtime-client hops

`assistant-client-hop.ts`, `assistant-hop-route.ts`, `assistant-client-root.ts`: `@houston/runtime-client` owns the path literals for SDK modules that go through a sub-client, so the request is two hops away (SDK method, client method, `this.r.request(...)`). The client method is read with the caller's arguments bound to its parameters, and the client's root prefix is prepended: `ctx.clientFor(agentId)` roots at `/agents/{agentId}` (built in `packages/sdk/src/sdk.ts`), while user-scoped clients take the base URL and their literals already carry `/v1`. A client the operation was handed (a parameter or a property such as `this.client`) is not a hop: the function is the owner's helper. A call that lands in a sub-client whose root cannot be composed is reported as unresolved, not skipped, because otherwise the operation would vanish from both the catalog and the gate. The client's literals were not written against the adapter's transport contract, so `const`s they name are resolved too. The route's return type is the client method's, not the SDK wrapper's, and `rawResponse` is false when either body does more than return the call.

## Optional query strings

`assistant-query-params.ts`, `assistant-query-set.ts`: the only supported idiom for optional query keys is a `URLSearchParams` local written through `.set` under at most one `if` that proves the value present (`x`, `x !== undefined`, `x != null`), read once through `.toString()` and spliced as `${qs ? `?${qs}` : ""}` as the whole query. The catalog needs no optionality marker because the host dispatcher (`buildQuery` in `packages/host/src/routes/assistant-request-parts.ts`) already drops a key whose parameter was omitted. A seeded params object, one that escapes elsewhere, or a guard that selects rather than proves presence makes the query undescribable. A key whose value no SDK caller can reach is dropped, since its guard never opens.

## Route claims between SDK names

`assistant-route-claims.ts`, `assistant-extractor.ts`: two SDK names can reach one host route on purpose (a no-refetch write primitive and the refetching facade op). Visibility decides which one the catalog publishes, never facade order, because a reordered `return {}` block would otherwise silently swap a callable operation for its hidden twin. Two claimants of the same visibility go to the coverage gate as a route conflict. A facade op re-implementing a route the canonical adapter copy already publishes is dropped from the catalog but still judged by the gate, so an unannotated SDK function cannot reach the assistant the day either copy's path literal changes.

## `@assistant` JSDoc grammar

`assistant-jsdoc.ts`: the leading `*` is optional so a one-line block still parses its tags; otherwise a `hidden:` written on one line would publish the operation. A reason-bearing tag's reason runs to the end of its line. `confirm` and `hidden` stand as bare flags, so a missing rationale is reported by the gate with a message naming what is owed rather than as an unknown tag. `@param` descriptions wrap across continuation lines (ordinary JSDoc wrapping). An unparseable `hands:` card is left off the document and reported, because the host dispatches nothing it cannot name. The groups are a closed set (`ASSISTANT_GROUPS`); anything else is a typo.

## Coverage rules

`assistant-gate-rules.ts`, `assistant-hands-rules.ts`:

A hidden operation with a stated reason is exempt from the routing, schema and confirmation rules, because it is never dispatched. A bare `hidden` is never exempt.

A `confirm` needs a stated reason. Every card ends the turn and asks the person, and unjustified confirmations train people to answer yes without reading; the confirmed list in the operations doc is the confirmation budget and is meant to stay short.

Stale exceptions (a `debt:` note or unroutable acknowledgement that no longer applies) fail even for hidden operations, because the drift check cannot see them.

Route conflicts and the hands rules are judged outside the hidden exemption: two hidden twins would leave a route to source order, and hiding is exactly what raises the hands question.

Hands: `hidden:` says the assistant must not call it, not that the errand is done. For groups in `NEEDS_HANDS_GROUPS` (mutations, or all operations for `files`, since bytes cannot ride a chat turn), the author must name a card that reaches it or state that none does. This is decided structurally, not by a prose regex or a committed name list, which would go stale silently. Only derived non-GET methods count as mutations; unroutable operations are already judged by `unroutable`.

## Identifier sources

`assistant-entity-rules.ts`, `assistant-entity-sources.ts`, `assistant-field-rules.ts`, `assistant-nested-fields.ts`: an identifier is never guessable, so every identifier parameter gets a discovery operation and either a live `EntityDirectory` collection the host resolves it against or a stated reason none exists. Rules are declarative and keyed on the literal segment a placeholder follows, so a new operation on an existing collection is covered once annotated. `after` (the path) beats `names`; `pathContains` narrows when two families mount the same collection name (integrations versus channels connections, `/files` versus `/agentfile`), because sending a model to the wrong listing is worse than none. Body-field rules come last and are qualified as `<param>.<field>` (top-level `provider` on integration operations is a different thing from the AI provider). Nested fields are claimed one level in, only when declared; the spelling heuristic is not applied there because creation payloads are full of `slug`/`id` fields naming something being made. A closed schema needs no discovery source, the `{type:"null"}` branch neither opens nor closes a set (matching `packages/runtime/src/session/tools/assistant-schema-hint.ts`), and an operation is never its own discovery source.

## Schema quirks

`assistant-schema.ts`: template-literal and mapped string types, and `"a" | (string & {})` widenings, are emitted as strings; walking their properties would emit the String prototype as a 50-property object. A type parameter answers through its constraint.

## Capability index

`renderCapabilityIndex` in `assistant-render.ts`: one line per group naming every operation, carried in the coordinator's always-on context, because a model that must search before knowing a capability exists sometimes answers from memory and wrongly says a thing cannot be done. It lists only operations `houston_call` will perform; unroutable ones are omitted (a group with none drops out) so the agent never promises an action the build cannot do. The text is written by `renderAssistantCapabilityIndex` in domain, because the runtime renders it again over what the deployment serves; this module only wraps it, so there is one copy of the wording.

## Tests

The policy floor (`OPERATION_POLICY_FLOOR`) pins each operation's group, confirm, visibility and route, so moving a capability from a `cp/*` copy to an SDK module must carry the whole `@assistant` block and the exact route. A new operation with no floor line fails.

The manager is told "You are Houston", so visible operation text must not say "Houston" as an actor.

The live-adapter coverage test builds the whole TypeScript program in the test body, which takes about 4.8 s on CI, near vitest's 5 s default, hence its longer timeout.

Fixture precedence order matters: `assistant-dedup.ts` republishes `listThings`.
