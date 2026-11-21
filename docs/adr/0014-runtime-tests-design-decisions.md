# Runtime tests: design decisions

Decisions held by `packages/runtime` test files: production behavior and external quirks the tests pin, and the fixture rules the suites depend on. Complements the other runtime ADRs (0006 to 0015).

## Provider catalogs and defaults (packages/runtime/src/ai)

- `uncuratedDefaultModel` must retain Mistral Large 4 as the preferred Mistral default, and `mistral-catalog.test.ts` must guard its catalog entry. If that entry disappears, resolution falls back to pi's first Mistral row, a Codestral model with a 4K to 8K output cap. The choice governs both a fresh connection and its key-verification probe.
- OpenCode's open-catalog selection policy does not make pi's `getModel` catalog open-ended. `canonicalModelId` needs curated replacements for stored IDs that pi removed because `safeGetModel` still needs a catalog row to construct the runnable model. A gateway accepting an ID does not establish that the installed pi version can construct it.
- The Google request path exercised by `probe` and `sentLevel` must send `LOW` when Gemini 3.7 Flash or later receives an omitted or `minimal` reasoning level. Those models reject `MINIMAL` with HTTP 400. Earlier Flash models and Flash-Lite accept `MINIMAL`, so the floor must remain model-specific. Gemini 4 Neon also rejects `MINIMAL` and offers no thinking-off level.

## Runtime test isolation (packages/runtime/src/ai, packages/runtime/src/auth, packages/runtime/src/backends/claude)

- Suites that exercise persistent runtime singletons must set `HOUSTON_DATA_DIR` or `HOUSTON_HOME` before dynamically importing their runtime modules. `config.dataDir` is captured at module evaluation, so changing the environment afterward cannot redirect endpoint, settings, credential or provider-mark writes. Vitest's separate module registry per test file makes the early environment assignment effective.
- `read-token.test.ts` can set its temporary `HOUSTON_HOME` without dynamically importing the token reader because `houstonHome()` reads the environment on every call. Its data directory must also be isolated because served-provider checks read the manifest there.
- Login suites must replace `resolveClaudeCliBinary` with a resolver returning `null` when testing the paste flow. Test hosts can have the real SDK binary installed; allowing normal resolution would start the CLI and could open a browser. `null` deliberately selects the waiting paste flow.
- Console-spy suites must restore mocks between tests. Vitest 4 returns an existing spy when the same method is spied on again, so repeated `vi.spyOn` calls do not establish independent call histories.
- The `workspace` and `tempRoot` helpers used by Claude file-policy tests must canonicalize temporary directories with `realpathSync`. On macOS, `/var` resolves through `/private/var`; `WorkspaceGuard` canonicalizes its root, so an uncanonicalized fixture path can make an ordinary workspace path appear outside that root.

## Independent test evidence (packages/runtime/src/config.test.ts, packages/runtime/src/backends/claude/cli-transcript-gc.test.ts)

- `DEFAULTS_BY_PROVIDER` must remain an independently written inventory rather than being derived from `DEFAULT_MODEL`. Deriving the iteration from the domain table would omit precisely the missing domain entries that the comparison needs to detect.
- The `binaryContains` check must require both `CLAUDE_CODE_TRANSCRIPT_LOCAL_GC` and `setLocalGcEnabled`. The environment-variable name also occurs in the CLI's environment registries, so finding that name alone does not establish that the cleanup switch still exists.

## Callback-port test isolation (packages/runtime/src/auth/codex-port-preflight.test.ts, packages/runtime/src/auth/login.test.ts)

`preflightCodexCallbackPort` retains its configurable port for tests. The preflight unit suite must use ephemeral ports because Vitest runs files in parallel and `login.test.ts` exercises the real callback port, 1455. Sharing 1455 across both suites made unrelated tests contend for the same listener.

## Claude callback dispatch (packages/runtime/src/backends/claude/custom-tools.test.ts, packages/runtime/src/backends/claude/live-mode.test.ts)

The scripted `query` implementations must start their background dispatch task synchronously when `query()` is called, then invoke the tool handler or permission callback across an asynchronous boundary. This matches the SDK's subprocess-reader lifecycle. The reader inherits the active `AsyncLocalStorage` context at creation, which is why later callbacks can record into the turn's interaction holder and observe its mutable mode reference.

## Codex stream recovery (packages/runtime/src/backends/pi/codex-websocket-retry.test.ts)

The retry policy exercised through `PiSession` must reissue the complete request with the conversation intact after a mid-stream Codex WebSocket closure. pi falls back to SSE only when the failure occurs before its first stream event. Codex rejects `store: true`, so a closed connection leaves no stored response that a replacement connection can resume. Recovery therefore needs a bounded request retry rather than response continuation.

## Browser hand-off duration (packages/runtime/src/backends/claude/custom-tools.ts, packages/runtime/src/backends/claude/claude-env.ts, packages/runtime/src/backends/claude/mcp-browser-bridge.test.ts)

`buildHoustonMcpServer` must leave the SDK server timeout unset, and `buildClaudeEnv` must exclude ambient `MCP_TOOL_TIMEOUT`. The SDK bridge is effectively unbounded unless either setting supplies a limit. A limit below 11 minutes can terminate a waiting browser hand-off before its intended wait completes.

## Assistant discovery and deployment compatibility (packages/runtime/eval/discoverability.test.ts, packages/runtime/src/session/assistant-capability-map.ts)

- `assistantCapabilityMap` must ignore unserved-operation names absent from its embedded catalog. Managed rollouts can leave the host and runtime one release apart, so an unfamiliar name is an expected version difference and must not invalidate the map.
- The description checks in `discoverability.test.ts` cover model-facing tool and parameter descriptions because the model repeats their wording to non-technical users. Punctuation restrictions therefore apply there as part of product copy, even though those descriptions are not rendered directly.

## Fixed request costs (packages/runtime/src/session/context-budget.test.ts)

`BUDGET` makes growth of the always-present prompt and tool definitions an explicit review decision. The twenty-skill fixture represents text sent again on every model request. Raising a budget requires explaining what the added text buys. A rule needed only for one workflow belongs in that workflow's tool description or result.

## Model-window evidence (packages/runtime/src/session/model-windows.test.ts)

`MODEL_WINDOW_OVERRIDES` follows Codex's `/status` sizing rather than pi's catalog alone. The effective standard window is 95% of 272,000 tokens, or 258,400. The larger ceiling is 95% of 872,000, or 828,400. Pi's 1,050,000-token entry for `gpt-6-astra` does not establish either effective window. Using the raw standard window makes the context bar read emptier than Codex reports; omitting the larger ceiling compacts conversations that the provider can still carry.

The GPT-6.1 rows and `gpt-6.2-sol` retain pi's 500,000-token windows because no `/status` observation supports a different number. The 95% adjustment is evidence specific to the overridden rows.

## Bundled worker initialization (packages/runtime/src/turn/import-cycles.test.ts)

The import graph checked by `runtimeEdges` must remain valid for the esbuild bundle, even when the same sources load successfully through plain ESM. Esbuild's `__esm` initialization can make modules in a cycle await each other when the graph contains top-level await. The event loop then empties and Node exits without output. Successful source execution therefore does not prove that the worker bundle can boot.

## Runtime test initialization (packages/runtime/src/session/backend-switch.test.ts, packages/runtime/src/session/chat.test.ts, packages/runtime/src/transport/server-providers-scope.test.ts, packages/runtime/src/turn/turn-shared-skills.test.ts)

- `config` and `authStorage` bind their data paths during module evaluation, and importing `conversation-cache` constructs the backend registrations. Runtime fixtures must select temporary data and workspace directories before importing that graph. Fixtures exercising the shared Claude login must also set `HOUSTON_HOME` before import, or the developer's existing login can change the result.
- The console spy in `turn-shared-skills.test.ts` needs restoration between cases because Vitest 4 returns the existing spy when the same method is spied on again. Repeated `spyOn` calls alone do not provide fresh call history.

## Shared-skill listing compatibility (packages/runtime/src/turn/turn-shared-skills.ts)

`skillOf` must check the `skills/` directory boundary after the manifest request. Older pod-store implementations match the requested `skills` prefix as a raw string and can also return siblings such as `skills-old`. A successful listing does not establish that every returned object belongs in the snapshot.
