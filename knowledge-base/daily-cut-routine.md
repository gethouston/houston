# Daily cut routine — Houston schedules its own release train (PRODUCT-1329)

The morning cut of the desktop cloud train is no longer fired by a GitHub cron.
**A Houston routine is the scheduler**: every weekday morning a cloud agent
dispatches `daily-cloud-cut.yml`, writes the user-facing release notes, watches
the run, and posts the outcome to Slack. The heavy machinery stays in GitHub
Actions — signing, notarization, and the guarded tag push cannot and should not
move — but the *when*, the *notes*, and the *announcing* are Houston's.

Why: GitHub's `schedule` queue is best-effort and delivered the old 10:22 UTC
slot 30–120 min late (HOU-1013), forcing a ~103-min fudge factor. Houston's
cron fires on time. And the release train is exactly the kind of job Houston
exists to run — dogfooding it is the point.

## Division of labor

| Piece | Owner | Change |
|---|---|---|
| Schedule (weekdays ~07:00 Bogotá) | **Houston routine** | GH `schedule:` trigger deleted |
| Cut (guards, version bump, tag push) | `daily-cloud-cut.yml` | now `workflow_dispatch`-only; gained `notes`/`notes_es`/`notes_pt` inputs |
| Release notes | **the agent** | passed via the `notes` inputs → written to `.github/release-notes/<version>[.es|.pt].md` inside the release commit → release.yml uses them verbatim as the body AND embeds them in the updater's `latest.json` |
| Draft build (DMG, sign, notarize) | `release.yml` | unchanged |
| Linear stamp | `linear-release-stamp.yml` | unchanged — still fires on the tag push, fully automated |
| Slack announcing | **Houston routine** | success, quiet-day, and failure posts; failures are one copy-pasteable block |
| Backup Slack pings (red-main guard, draft-ready) | workflows | kept as a safety net while the routine proves out; remove release.yml's draft-ready post once redundant |

## Setup in the Houston app (one-time)

1. **Agent.** In the hosted cloud team space, create (or reuse) a dedicated
   agent — e.g. *Release Captain*. Routine runs execute on the agent's cloud
   pod, so this must be a cloud agent, not desktop-only.
2. **GitHub connection.** Connect the GitHub integration on that agent,
   authorizing as an account with push access to `gethouston/houston`
   (dispatching a workflow needs `actions: write`). If the Composio GitHub
   toolkit's OAuth scopes turn out not to cover workflow dispatch, fall back to
   a custom API integration holding a fine-grained PAT (Actions: read/write,
   Contents: read on `gethouston/houston`).
3. **Slack connection.** Connect Slack and pick the release channel the posts
   should land in. Make sure the agent's integration allowlist includes both
   GitHub and Slack.
4. **Model.** Give the agent a capable model; the AI account must be usable at
   team scope, since routine runs fire on the team credential.
5. **Routine.** Create a routine with a cron schedule, weekdays 07:00
   America/Bogota, and paste the prompt below.
6. **Supervised first run.** Ask the agent to run the routine once by hand on a
   safe morning. Verify: the dispatch appears in the repo's Actions tab, the
   tag + draft build succeed, the draft body carries the agent's notes, and the
   Slack posts look right.
7. **Only then** merge the PR that removes the GH cron. Rollback is one line:
   re-add the `schedule:` block to `daily-cloud-cut.yml`.

## The routine prompt

Paste verbatim (fill in the Slack channel):

```text
You run the morning cut of the Houston release train. Repo: gethouston/houston.
Post everything to the Slack channel #RELEASE-CHANNEL. Work in English in
GitHub, but write user-facing release notes in en + es + pt as described below.

Steps, in order:

1. Find the latest cloud-v* tag (semver order, not creation order). List the
   pull requests merged into main since that tag was created.
2. If NO pull requests merged since the last cut, post one short Slack line:
   "No release today. Nothing merged since cloud-v<last>." and stop.
3. If a DRAFT release with a cloud-v* tag newer than the last published one
   already exists and was created in the last 20 hours, do not cut again: post
   "Today's draft cloud-v<version> is already waiting." with its link and stop.
4. Write the release notes from the merged PRs. This is a product presentation
   for non-technical users, not a changelog: 3 to 5 top items, each one line,
   benefit first, plain words. No PR numbers, no file names, no dev jargon. If
   there are only internal fixes, one line: "Stability and polish improvements."
   End with a short "Fixes and polish" line summarizing the rest. No em dashes.
   Produce three versions: English, Latin-American Spanish (neutral, tú),
   Brazilian Portuguese (você).
5. Dispatch the workflow .github/workflows/daily-cloud-cut.yml on ref main with
   inputs: notes = the English markdown, notes_es and notes_pt = the
   translations. Leave the version input empty.
6. Poll the dispatched run every 30 seconds until it completes (normally under
   5 minutes).
   - Completed, tag pushed: continue to step 7.
   - Completed but the logs say "no new commits ... skipping": post the
     quiet-day line from step 2 and stop.
   - Failed: fetch the failing job, step name, and the last ~30 relevant log
     lines. Post the FAILURE MESSAGE (format below) and stop.
7. The tag push triggers the release.yml draft build (~30-40 min). Poll the
   release.yml run for the new cloud-v<version> tag every 2 minutes, up to 50
   minutes.
   - Success: find the draft release, get the staging DMG asset link (name
     starts with Houston_staging) and the draft's html_url. Post to Slack:
     version, one-line summary, the top items from your notes, the staging DMG
     link (the one to QA in the 08:30 daily), and the draft link.
   - Failure: post the FAILURE MESSAGE for the release.yml run and stop.
   - Still running at 50 min: post the run link and say the build is slow but
     alive; do not fail.

FAILURE MESSAGE format. First line: ":red_circle: Daily cut failed for
cloud-v<version>" (or "for today's cut" if no version yet). Then ONE fenced
code block someone can copy and paste straight into a coding agent, fully
self-contained:

  Houston daily release cut failed. Please diagnose and fix.
  Repo: gethouston/houston
  Workflow: <workflow name>
  Run: <run URL>
  Failing job/step: <job> / <step>
  Log excerpt:
  <the relevant log lines>

Never retry a failed cut yourself. Never dispatch more than once per day.
Never delete tags, releases, or branches.
```

## Failure modes the prompt already covers

- **Quiet day** — the workflow's no-new-commits guard and the agent's merged-PR
  check agree (main is PR-only, so merged PRs ≡ new commits); the agent skips
  the dispatch entirely and says so in one line.
- **Red main** — the workflow's green-main guard fails the run naming the
  failing checks; the agent relays them in the copy-pasteable block. The
  workflow's own `SLACK_RELEASE_WEBHOOK_URL` ping stays as backup.
- **Double fire** — step 3's today-draft check plus the workflow's
  tag-already-exists guard.
- **Routine never fires** (pod down, credential broken) — the failure mode with
  no messenger. The 08:30 daily notices no draft; that morning, dispatch the
  workflow by hand from the Actions tab (the notes inputs are optional — blank
  falls back to the auto-changelog).

## Related

- The workflow itself: `.github/workflows/daily-cloud-cut.yml` (header documents
  the PAT, tag-only push, and guard rationale).
- The rest of the train: [production-infra.md](production-infra.md).
- Routine mechanics (cron scheduling, team-scope credentials):
  [routine-triggers.md](routine-triggers.md), [ai-accounts.md](ai-accounts.md).
