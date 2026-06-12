# Houston Cloud — Unit Economics (per user / month)

**TL;DR for the cofounder conversation:** a free user who *barely uses it* costs us
**~$0.02/month** (just storage). A free user who uses it like a real product costs
**~$0.10–$2.00/month**. **It does not matter how many agents they make** — an idle agent
is a row in a database and a folder in object storage, not a running server. The expensive
thing (a 24/7 container per agent) was deleted. We pay only when someone is actively using it.

> List prices, GCP `us-east1`, June 2026. LLM tokens are **$0 to us** — they ride the user's
> own ChatGPT/Codex subscription (connect-once). These are infra costs only, and the first
> ~years are covered by the **$200k in GCP credits**.

---

## The model in one line

**An agent is not a server you keep running — it's a row in a database + a folder in object
storage.** When the user sends a message, we rent a CPU for the ~30–90 seconds the turn takes,
then give it back. When they want to run real code (build a PowerPoint, crunch a CSV), we rent
a second, locked-down box for ~10 seconds. Between messages, **nothing runs and nothing is
billed** except a few cents of storage.

---

## Unit rates (the only numbers that matter)

| Resource | Rate |
|---|---|
| Cloud Run vCPU | $0.000024 / vCPU-second |
| Cloud Run memory | $0.0000025 / GiB-second |
| Cloud Run requests | $0.40 / million |
| GCS storage | $0.020 / GiB-month |
| GCS operations | reads $0.0004/1k · writes $0.005/1k |
| LLM tokens | **$0** (user's own subscription) |

**Cost of one chat turn** (1 vCPU + 512 MiB, ~60 s wall-clock, most of it waiting on the LLM):
`60 × (0.000024 + 0.5 × 0.0000025) ≈ $0.0015/turn`.

**Cost of one code execution** (1 vCPU + 1 GiB, ~10 s): `≈ $0.0003/task`.

---

## Per-user cost by activity level

| Component | **Idle** (signed up, dormant) | **Light** (~50 turns, 20 code runs) | **Heavy** (~1,000 turns, 500 code runs) |
|---|---|---|---|
| Workspace storage (GCS) | ~$0.02 (≈1 GiB) | ~$0.02 | ~$0.20 (≈10 GiB) |
| Agent compute (per-turn Cloud Run) | $0 | ~$0.08 | ~$1.50 |
| Code execution (sandbox) | $0 | ~$0.01 | ~$0.15 |
| GCS operations (hydrate/sync) | $0 | ~$0.01 | ~$0.10 |
| **Infra total / user / mo** | **~$0.02** | **~$0.12** | **~$1.95** |
| LLM tokens | $0 (their plan) | $0 (their plan) | $0 (their plan) |

**A free user who never returns costs us ~2 cents a month.** A genuinely active free user
costs well under a dollar. The number scales with *usage*, not with *sign-ups* and not with
*how many agents they create*.

---

## Why "how many agents" doesn't matter (the old trap)

The first design gave every agent a 24/7 container (a GKE pod with a ~$10/month floor). A user
who made 10 agents but used 2 cost us **~$100/month** — we paid for 8 idle boxes. At 745 users
that was **~$74,500/month**.

This design deletes the floor entirely:

| | Old (pod per agent) | New (per-turn) |
|---|---|---|
| Idle agent | ~$10/mo each | **~$0** (a DB row + a folder) |
| 10 agents, uses 2 | ~$100/mo | **~$0.10/mo** (pays for the 2 in use) |
| Cost driver | # of agents created | actual turns taken |

So a user can spin up as many agents as they like; we only pay when one is *actively
answering a message*.

---

## Fleet totals (what to put in front of the cofounder)

Assume a realistic free-tier mix: **70% idle, 25% light, 5% heavy.**
Blended infra cost ≈ `0.70×$0.02 + 0.25×$0.12 + 0.05×$1.95 ≈ **$0.14 / user / month**.`

| Scale | Blended infra / mo | Notes |
|---|---|---|
| **745 users** (today) | **~$100–300** | rounding up for headroom; covered by credits for years |
| **10,000 users** | **~$1,400–4,000** | still LLM-free to us |
| **100,000 users** | **~$14k–40k** | the point where you'd graduate the hot path to a warm GKE pool |

**The $200k GCP credits cover the 745→10k journey with room to spare**, and LLM cost stays at
$0 to us the whole way because every user brings their own ChatGPT/Codex subscription.

---

## The honest caveats (so the cofounder trusts the number)

1. **The blended average hides power users.** A handful of very heavy users (or anyone running
   scheduled/automated agents that never go idle) pull the average up. Model those separately
   once they exist; the per-turn rate ($0.0015) is the lever.
2. **A "turn" bills for wall-clock, including LLM wait.** ~60 s is the working assumption; if
   turns routinely run 2–3 minutes (long tool chains), the agent-compute line scales linearly.
   The fix at scale is request-based concurrency or a warm pool — not needed yet.
3. **These are list prices before credits.** Real spend is lower while credits last, and the
   committed-use / sustained-use discounts apply after.
4. **LLM = $0 only under the subscription model.** It stops being free the moment we put our own
   API keys behind it. The whole "free user is ~2 cents" story depends on connect-once staying
   the credential model (it is — see `cloud/code-execution.md`).

---

*Source: `cloud/code-execution.md` (architecture + security), live deployment on `gethouston`.
Rates: GCP Cloud Run / Cloud Storage public pricing, us-east1, June 2026 — re-verify before
quoting hard dollars externally.*
