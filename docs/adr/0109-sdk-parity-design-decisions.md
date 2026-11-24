# SDK parity gate: design decisions

Covers `scripts/sdk-parity/`, `scripts/check-sdk-parity.ts` and `scripts/sdk-parity-exceptions.json`: the gate that binds every `sdk` route to exactly one SDK method. Short file paths are relative to `scripts/sdk-parity/`.

## What the gate asks

`check-sdk-parity.ts` runs on every `pnpm check` and fails the process on any violation `scripts/sdk-parity-exceptions.json` does not excuse: does every route a signed-in person can reach have exactly one `@houston/sdk` method, and does every SDK method reach a route some server serves. It runs under tsx, not `node --experimental-strip-types`, because the host's modules import each other extensionlessly, which Node's ESM resolver refuses. `HOUSTON_SDK_PARITY_EXCEPTIONS` points it at a fixture so its own test can run the real script with one exception removed: the gate is only a gate if the process exits non-zero, and every other test judges fixtures the script might never reach.

## Rules (`rules.ts`)

R1: a route a signed-in person can reach with no SDK method behind it.

R2: an SDK method no server answers. Any one of its keys answering is enough, because a method whose path parameter is closed to a set issues one call per call site, not one per member. A literal key also meets an any-key route (`ANY_KEY_PATHS`: the host's `packages/host/src/routes/account.ts` and the gateway's `prefs.go` store whatever preference key they are given).

R3: the same key declared twice on one server. Host and gateway overlap is legal. The gateway mounts `/x` and `/x/` on one handler on purpose (Go's mux would redirect otherwise), so the pair is collapsed before counting.

R4: a declared runtime-proxy member nothing reaches, meaning the list went stale against the client that calls the agent's runtime.

R5: the inverse of R1 from the client side: an adapter method the shipped app calls that reaches a server on its own. One adapter covers desktop and web, so both surfaces are judged at once.

A gateway pattern whose methods are `*` dispatches inside its handler, so any method on that path counts as served.

## Exceptions file

`parseExceptions` and `judge` in `gate.ts`: the file's shape is validated rather than trusted, because a mistyped `rule` would excuse nothing while reading like accepted debt, and `baseline` is the one number the gate cannot recompute. An exception that no longer reproduces also fails, so the change that fixes a violation deletes its excuse; otherwise the next real violation with the same identity would pass unseen.

## Gateway inventory is vendored

`gateway-inventory.ts`, `vendor.ts`, `gateway-sibling.ts`: the gateway lives in the private cloud repo and this repo's CI holds no token for it, so `cloud/internal/edge/routes.generated.json` is vendored byte-for-byte with a stamp naming the cloud commit. Cloud's CI opens the refresh PR; `pnpm vendor:gateway-routes` does it by hand (`HOUSTON_CLOUD_ROOT` overrides the sibling checkout location). The vendored copy is what every run judges, developer and CI alike, so both servers are always known and there is one reproducible verdict. A sibling cloud checkout is consulted only to report freshness (`agrees`, `absent`, `ahead` meaning the copy is stale, or `elsewhere` meaning a branch or behind main), never to change the verdict, since a developer's checkout can be on any branch. Line endings and a missing final newline are checkout artefacts, not disagreements. A blank `HOUSTON_CLOUD_ROOT` names no checkout; a configured root that exists without the inventory file is reported, because it is a variable aimed at the wrong directory. Copying is byte-identical because any rewrite would make developer runs disagree with CI.

## Join key normalization

`normalize` in `inputs.ts`: every parameter spelling (`:agentId`, `{slug}`, `${id}`) folds to `{}` and a trailing slash is dropped. A rest-of-path parameter (`*rest`, Go's `{path...}`, an SDK parameter with `encoding: "path"` such as `relPath`) folds to `{*}` instead, so a one-segment route and a whole-subtree route never compare equal. `routePaths` additionally expands a path parameter whose schema is closed to a set of string literals (an `anyOf` of `const` branches or an `enum`) into one literal path per member, because the gateway declares some members literally (`/v1/integrations/composio/connections`) while the SDK takes the provider as a closed argument. Nothing folds the other way: folding a server literal to `{}` would let any literal bind any parameter.

## Client side: adapter call graph

`adapter-graph.ts`, `adapter-scope.ts`, `adapter-methods.ts`, `inputs.ts`:

The adapter is read whole (`cp/` and helper modules, not only the mixins), because a mixin method's request is usually made one or two calls deeper. Only mixin classes publish methods, and the mixin chain composes into one class, so method names are unique. Desktop and `packages/web` both depend on the same adapter, so there is no separate desktop input. Only the SDK module tree counts as SDK methods; the web adapter binds the SDK and is not a second client.

Every function-like body becomes a node and every call or `new` an edge, resolved through the calling file's imports (no type checker; the adapter's imports are relative paths). A class gets one aggregate node whose edges are all its methods, so `new SomeStore(ctx)` pulls in everything the instance could run. The graph errs only toward over-reach: it can make a method look like it does more, never less. Callees are read through `unwrap` so `(helper as Fn)()` and `(await ready).refresh()` still produce the edge.

`this.ctx.*` is not an edge: the context is the transport, and its members are read as markers. `sdk` and `sdkForSpace` mean delegation; `BOOKKEEPING` lists the context members that carry no request. A member added to `AdapterContext` and not listed reads as transport, which over-reports instead of letting an unbound request through. A helper handed `cp` instead of `ctx` is detected by its transport calls (`cpFetch`, `httpRequest`, `gatewayAuthFetch`).

A method that reaches both the SDK and a raw transport is not reported as unbound: the rule asks whether the method delegates, and per-request attribution would need dataflow this graph deliberately avoids.

Native Tauri commands are listed separately; their own gate is `scripts/check-desktop-native.mjs`.
