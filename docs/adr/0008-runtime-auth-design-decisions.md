# Runtime credentials: design decisions

Decisions and external constraints of `packages/runtime/src/auth`. Complements ADR 0006 (`0006-runtime-design-decisions.md`), which keeps the shorter summary; each section names the symbol it governs.

## Claude CLI login (packages/runtime/src/auth/anthropic-cli-binary.ts, packages/runtime/src/auth/anthropic-cli-login.ts, packages/runtime/src/auth/anthropic-cli-output.ts, packages/runtime/src/auth/anthropic-setup-token.ts)

- `sdkScopedResolve` anchors resolution at the SDK's main export because the SDK's exports map blocks resolving its `package.json` directly. `resolveClaudeCliBinary` tries both the platform package's binary subpath and its `package.json` because package exports differ between SDK versions.

- `spawnCli` runs `claude auth login --claudeai` with piped stdio because that command uses a plain readline flow. `runAnthropicSetupTokenLogin` must not replace pasted tokens with a piped `claude setup-token` subprocess: that command uses an Ink TUI requiring a real TTY. The recorded probe produced zero bytes and no clean error. Direct OAuth PKCE replay remains excluded because Anthropic has blocked that path since 2026-04.

- `runAnthropicLogin` relays a pasted authorization code because a browser on another machine cannot reach the runtime-side CLI's callback listener. This is why remote login needs the code channel even though a co-located browser can finish through the listener.

- `AnthropicLoginCallbacks.onAuth` uses the presence of `instructions` to select the client interaction. Instructions mean token paste, with the URL acting as a help reference. Their absence means open the authorization URL and paste its returned code. Adding explanatory instructions to the CLI authorization response would select the wrong interaction.

## Claude credential ownership (packages/runtime/src/auth/anthropic-cli-keychain.ts, packages/runtime/src/auth/anthropic-cli-credential.ts, packages/runtime/src/auth/anthropic-login-dir.ts)

- `readKeychainCredential` must never read the bare `Claude Code-credentials` service. That item belongs to the machine user's personal CLI installation. Adopting it would make Houston and that installation rotate the same refresh-token family and sign each other out.

- `discardMintedCredential` reports cleanup failures without failing an already stored login. Directory removal and Keychain removal are attempted independently so a failure removing one copy does not prevent removal of the other.

- `anthropicSharedLoginDir` keeps the credential locally when the host never serves Anthropic back because central capture would create a credential row that nothing returns to the runtime. Capture would then scrub the local refresh token, producing a connection that appears healthy for one poll and subsequently stays disconnected.

## Credential files and serialization (packages/runtime/src/auth/auth-file.ts, packages/runtime/src/auth/credential-store.ts)

- `scopeFileStem` deliberately truncates SHA-256 to 16 hexadecimal characters, or 64 bits. The collision allowance assumes team-sized membership, rather than a globally shared identity namespace.

- `HoustonAuthStore` relies on one process owning each data directory. The host, runtime and serve-path writers share that process, so the per-scope, per-provider promise chains provide the required serialization without a cross-process file lock. Running independent writers against one data directory would invalidate that assumption.

- `PiCred.enterpriseUrl` must survive storage and serving because a Copilot Enterprise credential belongs to its issuing domain. Besides determining the model API endpoint, that domain selects the refresh URL `https://api.<domain>/copilot_internal/v2/token`.

## Credential health and persistence (packages/runtime/src/auth/credential-fingerprint.ts, packages/runtime/src/auth/provider-marks.ts)

- `credentialFingerprint` reads persisted files directly instead of using `auth/storage.ts`. Error classifiers call it from beneath the backend layer, while storage reaches back into the Claude backend. Using the storage facade here would introduce an initialization cycle.

- `credentialFingerprint` includes the shared Claude credential file only for the team scope. Including it in a personal fingerprint would let a team credential push change another member's fingerprint and incorrectly clear that member's failure mark.

- `readProviderMarks` caches by resolved file path because pooled execution can change `config.dataDir`. A process-wide loaded flag would reuse marks from the previous directory.

- `writeProviderMarks` keeps the updated marks in memory when persistence fails and reports the failure without interrupting turn-error classification. A full or read-only data directory must not replace the provider failure being classified. Status remains accurate in that process, although the mark may be absent after a restart.

## Credential initialization and imports (packages/runtime/src/auth/storage.ts, packages/runtime/src/auth/empty-refresh-guard.ts, packages/runtime/src/auth/served-scope.ts, packages/runtime/src/auth/served-key-guard.ts)

- `modelRuntime` intentionally leaves network model discovery disabled during `ModelRuntime.create`. The default `allowModelNetwork: false` keeps boot offline and deterministic; creating the shared runtime must not depend on catalog network availability.

- `PI_OAUTH_MIN_VALIDITY_MS` mirrors pi's five-minute refresh floor. The gateway also serves with a five-minute margin, so receiving an access-only credential inside pi's refresh window is a recurring state. `maskAccessOnly` relies on pi's side-effect-free OAuth `toAuth` conversion to use the token's remaining validity without attempting a refresh.

- `runEmptyRefreshServeSync` uses a bound callback because a dynamic import of `serve.ts` would still close the initialization cycle through `storage.ts`, whose top-level await prevents the bundler from ordering that cycle. An unbound read during boot is legitimate: `ModelRuntime.create` reads credentials before `serve.ts` can finish loading. Turn-start synchronization supplies the credential before the first request, while the modify mask remains active during boot.

- `recordServedScope` and `servedScopeFor` remain outside `serve.ts` because `ai/providers.ts` consumes their verdicts and `serve.ts` imports `ai/providers.ts`. Moving the verdict store into serve would close the storage, providers and serve initialization cycle.

- `servedApiKeyIsDead` and `reportDeadServedApiKey` use protocol subpath imports so serve initialization does not load the protocol barrel's zod-heavy wire modules. Those modules are unnecessary on the runtime's credential hot paths.

## OAuth lifecycle contracts (packages/runtime/src/auth/login-policy.ts, packages/runtime/src/auth/login-state.ts, packages/runtime/src/auth/login.ts)

- `OPENAI_CODEX_BROWSER_LOGIN_METHOD` and `OPENAI_CODEX_DEVICE_CODE_LOGIN_METHOD` duplicate pi's literal option IDs, `"browser"` and `"device_code"`, because pi stopped exporting the named constants in 0.80.8. They must track the upstream prompt IDs; drift produces pi's `"Unknown OpenAI Codex login method"` error.

- `LOGIN_TIMEOUT_MS` is ten minutes to match the local client's sign-in watcher. Its effect extends beyond one runtime: an abandoned loopback flow holds the provider's fixed callback port and blocks sign-in by other instances on the same machine.

- `cancelLogin` must both abort the provider signal and reject the paste promise. Device-code pollers stop through the signal; loopback flows unwind through the rejected manual-code input, closing their callback server and freeing its port. Either action alone leaves one class of login running.

## API-key persistence and NVIDIA verification (packages/runtime/src/auth/login-keys.ts, packages/runtime/src/auth/nvidia-verify.ts)

- `setApiKey` validates and persists an Azure endpoint before storing its key. An invalid endpoint must not leave a stored credential with no usable destination.

- `NVIDIA_VERIFY_FALLBACKS` spans two model families so a family-wide gate cannot produce a false `key_restricted` verdict. `minimaxai/minimax-m3.1-flash` leads; `nvidia/nemotron-3.5-super-vl-120b-a12b` supplies the independent family. Earlier broadly served choices disappeared from pi's catalog: llama-3.x in 0.84.4, gpt-oss-120b in 0.85.0, and gpt-oss-20b in 1.6.0.

## Serve freshness and capture settlement (packages/runtime/src/auth/serve-probe.ts, packages/runtime/src/auth/serve-scrub.ts, packages/runtime/src/auth/report-revoked.ts)

- `probeOnce` requests `fresh=1` while the current credential has an authentication-failure mark because reconnect can update the central store without passing through the host process. Reusing the host's cached not-connected answer immediately after reconnect would prevent the replacement credential from reaching the runtime.

- `scrubRefreshTokens` records serve ownership at successful capture, before the first serve. Waiting until a serve applies the credential would leave a capture followed immediately by central sign-out with an unowned local copy that authoritative logout could not remove.

- `reportRevokedServedToken` retains successful report deduplication across later serves because observed central DELETE-to-GET lag returned an already removed token again. One pod repeated confirmed removals 15 to 30 seconds apart. Keeping the successful digest remembered prevents those repeated serves from producing repeated reports.
