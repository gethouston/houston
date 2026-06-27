# Turn-quality evals

Drives the canonical Houston tasks against a **live control plane** and scores
the artifacts. A pass means a real user could run the same prompt and download
a file that opens — the demo-able story, measured nightly instead of assumed.

| Case | Prompt produces | Structural checks |
|---|---|---|
| `deck` | `deck.pptx` | valid zip, `[Content_Types].xml`, `ppt/presentation.xml`, ≥ 4 slides |
| `spreadsheet` | `sales.xlsx` | valid zip, `xl/workbook.xml`, ≥ 1 worksheet, ≥ 2 data rows |
| `chart` | `chart.png` | PNG magic header, ≥ 5 KB |

Each case: create a throwaway agent → one turn → list/download the artifact →
validate → **delete the agent** (cleanup is part of the eval). Cases run
sequentially; one failure does not stop the rest.

## Run

```sh
pnpm install
cd cloud/evals
EVAL_CP_URL=https://app.gethouston.ai/api EVAL_TOKEN=<bearer> pnpm evals
# subset:           EVAL_ONLY=deck,chart pnpm evals
# results file:     EVAL_OUT=/tmp/results.json pnpm evals
```

`EVAL_TOKEN` is any bearer the control plane accepts:

- a **Supabase access token** (sign in as any user, copy the session token) — fine for a manual run, expires in ~1h;
- `dev:<userId>` against a local `CP_DEV=1` control plane;
- a **service token** (the unattended/nightly path, below).

The eval user must have a **connected OpenAI/Codex subscription** (connect once
through the web UI as that user) — turns bill to that subscription.

## Nightly (GitHub Actions)

The workflow lives here as `evals.workflow.yml` (a push credential with the
`workflow` scope couldn't be assumed). Activate it once with:

```sh
git mv cloud/evals/evals.workflow.yml .github/workflows/evals.yml && git commit && git push
```

It runs nightly against prod. Setup, once:

1. Create a dedicated eval user (e.g. `evals@gethouston.ai`) in Supabase, sign
   in through the web app, and connect its Codex subscription.
2. Mint a service token and map it to that user on the control plane:
   `CP_SERVICE_TOKENS="$(openssl rand -hex 32)=<that user's Supabase sub>"`
   (add it to `control-plane-secrets` and the deployment env).
3. Set the repo secrets `EVAL_CP_URL` and `EVAL_TOKEN`.

The workflow uploads `eval-results.json` as an artifact and fails red if any
case fails — wire alerting off the workflow status.

## Tests

`pnpm test` exercises the validators (real zip fixtures) and the driver
(subscribe-then-send, terminal-frame detection, timeout) against a stub
control plane. No network, no credentials.
