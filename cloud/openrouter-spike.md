# OpenRouter Codex CLI spike

Validates the process-local Codex config override contract before Houston wires OpenRouter into the runner (agent-03+).

## Exact command

Run from any directory. Do **not** edit `~/.codex/config.toml`.

```bash
codex exec \
  -c model_provider="openrouter" \
  -c model_providers.openrouter.name="OpenRouter" \
  -c model_providers.openrouter.base_url="https://openrouter.ai/api/v1" \
  -c model_providers.openrouter.env_key="OPENROUTER_API_KEY" \
  -c model_providers.openrouter.wire_api="responses" \
  -c model_reasoning_effort=high \
  --model openai/gpt-4o-mini \
  "Say hello in one sentence."
```

Notes:

- `-c model_reasoning_effort=high` is the same config guard Houston uses for other Codex invocations when the user's global Codex config may contain unsupported values.
- `--model` must be an OpenRouter model slug (see [OpenRouter models](https://openrouter.ai/docs/api/reference/list-available-models)).
- Houston will inject `OPENROUTER_API_KEY` into the agent subprocess env only; never write it to disk in `~/.codex/`.

## Expected behavior without `OPENROUTER_API_KEY`

With the env var **unset** in the shell:

1. Codex starts and accepts the custom provider overrides (no config.toml mutation).
2. The request fails with an auth-related error referencing the missing key or HTTP 401.
3. Houston's OpenRouter classifier maps this to `ProviderError::Unauthenticated` with `cause: no_credentials` (see `openrouter_classify.rs` tests).

Example failure shapes to expect (wording may vary by Codex version):

```text
unexpected status 401 Unauthorized: ...
```

```text
OPENROUTER_API_KEY is not set
```

```text
Missing environment variable OPENROUTER_API_KEY
```

Verify global Codex config is unchanged:

```bash
# Before and after the spike — contents must match
shasum -a 256 ~/.codex/config.toml
```

If `~/.codex/config.toml` does not exist, confirm it was not created by the spike.

## Smoke test with real API key (manual)

**Operator only.** Do not commit keys or paste them into logs.

### Prerequisites

- Codex CLI on PATH or Houston bundled binary
- OpenRouter API key from https://openrouter.ai/keys

### Steps

1. Export the key for the current shell only:

   ```bash
   export OPENROUTER_API_KEY="sk-or-..."
   ```

2. Run the exact command from the section above.

3. **Pass:** Codex streams a normal assistant reply (NDJSON on stdout), exit 0.

4. **Invalid key:** unset the export, set a bogus value, rerun:

   ```bash
   export OPENROUTER_API_KEY="sk-or-invalid"
   ```

   Expect HTTP 401; Houston should classify as `Unauthenticated` / `invalid_api_key`.

5. **Rate limit (optional):** if reproducible, expect HTTP 429 → `RateLimited`.

6. **Credits exhausted (optional):** if account has no credits, expect HTTP 402 → `QuotaExhausted`.

7. Confirm again that `~/.codex/config.toml` was not modified.

### Evidence to capture

- Exit code
- First stderr line on failure (redact any key material)
- Whether `config.toml` hash changed (yes/no)

File evidence in the feature tracker or PR when closing agent-01.

## Out of scope for this spike

- Houston credential store / REST routes (agent-05)
- Codex runner wiring in `codex_command.rs` (agent-03)
- Provider picker UI (agent-06/07)
