# Stateless claim-path falsifier

This spike keeps one pre-booted turn-server process alive while alternating
turns between two agents. Each request late-binds the agent prefix, workspace,
conversation, custom endpoint, and bearer credential. The model endpoint is a
loopback-only OpenAI-compatible echo server, so the default run needs no cloud
credentials, external network, or real LLM.

## Run

From the repository root:

```sh
pnpm --filter @houston/runtime spike:claim
```

The default runs 20 turns for each of two variants, alternating A/B throughout.
Optional controls are:

```sh
pnpm --filter @houston/runtime spike:claim --turns=40 --filler=100 --delay=75
```

- `--turns=N` (or a positional `N`) changes turns per variant.
- `--filler=N` changes the small workspace files seeded per materialized agent.
- `--delay=N` sets the echo provider's first-byte delay in milliseconds.

The driver removes inherited `ANTHROPIC_*`, `OPENAI_*`, and `*_API_KEY`
variables before importing runtime code. It sets the runtime's data and
workspace directories to a new temporary root, and deletes that root on exit.

## What it measures

`HOUSTON_TURN_TIMINGS=1` adds a diagnostic `timings` SSE frame immediately
before the terminal frame. The report includes:

- process boot to turn-server listen;
- median time for each claim-path phase;
- claim to first model token p50/p95, plus cold turn 1 and warm p50;
- claim to terminal p50/p95;
- hydration p50 and hydrated object count.

The materialized variant includes two distinct secrets and about 50 filler
files per agent. The hydrate-free comparison has an empty `workspace/`. It
starts with only the settings and local-endpoint objects needed to run a turn,
then naturally accumulates conversation/session objects as its turns sync back.

The run fails if credentials cross, conversation data crosses, an `auth.json`
reaches object storage, a preceding turn root survives into the next agent's
turn, provider environment variables reach runtime boot, or timings are not
immediately before the terminal frame. It also probes the process-wide
auth-failure map. That known finding is printed as `LEAK CONFIRMED` or
`NOT OBSERVED`, but is deliberately non-fatal.

## Real GCS variant

Use a dedicated disposable bucket because the spike writes and updates the
fixed prefixes `ws/W/agentA`, `ws/W/agentB`, `ws/W-empty/agentA`, and
`ws/W-empty/agentB` and does not delete them afterward. With Application Default
Credentials already configured:

```sh
HOUSTON_GCS_BUCKET=my-disposable-bucket \
  pnpm --filter @houston/runtime spike:claim --gcs
```

`--gcs` is the only mode that contacts a non-loopback service. The echo model
still remains local and receives no workspace data beyond the model prompt.

## Interpretation

Claim to first token includes temporary-directory allocation, hydration,
credential materialization, per-turn model/session construction, snapshotting,
and the configured echo delay. Compare the materialized and hydrate-free tables
to isolate object materialization cost from process-preboot gains.

For infrastructure preparation, treat roughly 5 seconds at p99 as the pass bar.
This driver prints p95 for quick local iteration; production load results should
also calculate p99. A local result well below the bar proves the code path can
reuse one pre-booted process, but does not by itself validate cloud scheduling,
GCS tail latency, or production concurrency controls.
