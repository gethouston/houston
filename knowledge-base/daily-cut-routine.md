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

**Two routines, not one.** The cut and the announcement are separate wakes:

- **Routine A — "Cut the release" (cron, weekdays 07:00 Bogotá):** writes the
  notes, dispatches the workflow, confirms the tag, posts the heartbeat. Done in
  ~3 minutes.
- **Routine B — "Announce the draft" (webhook):** woken by `release.yml` itself
  the instant the draft is built (~40 min later), it posts the draft-ready
  message. Nothing polls a 40-minute build: an agent run that sits watching CI
  is the fragile design, and the workflow already knows the exact moment.

| Piece | Owner | Change |
|---|---|---|
| Schedule (weekdays ~07:00 Bogotá) | **Houston routine A** | GH `schedule:` trigger deleted |
| Draft-ready announcement | **Houston routine B** | woken by a new `release.yml` step POSTing to its minted webhook |
| Cut (guards, version bump, tag push) | `daily-cloud-cut.yml` | now `workflow_dispatch`-only; gained `notes`/`notes_es`/`notes_pt` inputs |
| Release notes | **the agent** | passed via the `notes` inputs → written to `.github/release-notes/<version>[.es|.pt].md` inside the release commit → release.yml uses them verbatim as the body AND embeds them in the updater's `latest.json` |
| Draft build (DMG, sign, notarize) | `release.yml` | unchanged |
| Linear stamp | `linear-release-stamp.yml` | unchanged — still fires on the tag push, fully automated |
| Slack announcing | **Houston routines** | heartbeat, quiet-day, draft-ready, and failure posts; failures are one copy-pasteable block |
| Backup Slack ping (draft-ready) | `release.yml` | now the automatic FALLBACK: skipped when the Houston hand-off POST succeeds, runs unchanged when the webhook secret is unset or the POST fails. A train that announces nothing is the one unacceptable outcome |
| Backup Slack ping (red-main guard) | `daily-cloud-cut.yml` | unchanged safety net |

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
3. **Slack bot.** The Composio-managed Slack OAuth is a USER-token connection —
   posts would appear as the connecting human, wrong identity for release
   reports. Use the dedicated Slack app instead (bot user `houston_bot`,
   workspace app with only the `chat:write` scope): invite it to the release
   channel (`/invite @houston_bot` in #houston-drafts — bots cannot post to a
   channel they are not a member of), then store its `xoxb-` bot token in the
   agent's SECURE CREDENTIAL card, named `slack-bot-token`. The token never
   goes in the routine prompt, a chat message, a file, or a commit; rotating
   it (Slack app → OAuth & Permissions → Reinstall) only requires updating the
   stored credential.
4. **Model.** Give the agent a capable model; the AI account must be usable at
   team scope, since routine runs fire on the team credential.
5. **Routine A (cron).** Create a routine, schedule weekdays 07:00
   America/Bogota, prompt = "Routine A" below.
6. **Routine B (webhook).** Create a second routine and pick the **"From an
   external app"** wake (the intake's third option — *not* "When something
   happens in an app", which binds a Composio event instead), prompt =
   "Routine B" below. Mint its key and save the revealed URL as the repo secret
   `HOUSTON_DRAFT_WEBHOOK_URL` on `gethouston/houston`. The minted secret is the
   URL's LAST PATH SEGMENT — the gateway needs no auth header, so the whole URL
   is a credential: repo secret only, never a literal, never logged. Rotate by
   re-minting the key. Webhook wakes are hosted-cloud only — the Go gateway owns
   the ingress ([routine-triggers.md](routine-triggers.md)).
7. **Supervised first run.** Ask the agent to run routine A by hand on a safe
   morning. Verify: the dispatch appears in the repo's Actions tab, the tag +
   draft build succeed, the draft body carries the agent's notes, and both
   Slack posts (heartbeat, then draft-ready ~40 min later) look right and come
   from `houston_bot`.
8. **Only then** merge the PR that removes the GH cron. Rollback is one line:
   re-add the `schedule:` block to `daily-cloud-cut.yml`.

## Routine A — "Cut the release" (cron, weekdays 07:00 America/Bogota)

Paste verbatim (fill in the Slack channel):

```text
You run the morning cut of the Houston release train. Repo: gethouston/houston.
Post everything to the Slack channel #RELEASE-CHANNEL by calling Slack's
chat.postMessage API (POST https://slack.com/api/chat.postMessage, JSON body
{"channel": "#RELEASE-CHANNEL", "text": "<message>"}) authorized with the bot
token in your slack-bot-token credential. Messages support Slack mrkdwn; keep
code blocks fenced. Work in English in GitHub, but write user-facing release
notes in en + es + pt as described below.

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
   benefit first, plain words. No PR numbers, no file names, no dev jargon.
   Internal work (refactors, dependency bumps, engine plumbing) is never its own
   item: fold it into one "Stability and polish improvements under the hood."
   line. If nothing user visible shipped, that line is the whole body.

   Format, exactly:
   - First line: "## Houston v<version>" (keep the v; every past release has it).
   - Then the items.
   - Then, ALWAYS, this closing section, because these notes replace the
     auto-generated ones and updating users would otherwise lose the warning:

       ### Before you upgrade

       - Quit Houston before installing. macOS does not always replace an app
         that is running.

   NEVER use an em dash (—) anywhere in the notes. Use a comma, or split the
   sentence in two. This is a hard rule in this product's copy and it is checked.

   Produce three complete versions: English, Latin-American Spanish (neutral,
   tú), Brazilian Portuguese (você). Translate the closing section too.
5. Dispatch the workflow .github/workflows/daily-cloud-cut.yml on ref main with
   inputs: notes = the English markdown, notes_es and notes_pt = the
   translations. Leave the version input empty.
6. Poll the dispatched run every 30 seconds until it completes (normally under
   5 minutes).
   - Completed, tag pushed: post the HEARTBEAT (format below) and stop. You do
     NOT wait for the build: a separate routine is woken when the draft is
     ready.
   - Completed but the logs say "no new commits ... skipping": post the
     quiet-day line from step 2 and stop.
   - Failed: fetch the failing job, step name, and the last ~30 relevant log
     lines. Post the FAILURE MESSAGE (format below) and stop.

HEARTBEAT format, one line:
":hourglass_flowing_sand: Cutting cloud-v<version> now. Draft ready in about 40
minutes." Always post it on a cutting day, even though the draft message comes
later: its absence is how we notice this routine did not run at all.

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

## Routine B — "Announce the draft" (incoming webhook)

Woken by `release.yml`'s hand-off step the moment the draft prerelease is built.
The event payload carries everything the message needs, so this routine makes no
GitHub calls at all on the happy path.

```text
You announce a finished Houston release draft to the team. You are woken by an
event from our release pipeline; its payload has these fields: event, version,
tag, release_url, staging_dmg, prod_dmg, run_url, notes (the user-facing release
notes, markdown).

Post ONE message to the Slack channel #RELEASE-CHANNEL by calling Slack's
chat.postMessage API (POST https://slack.com/api/chat.postMessage, JSON body
{"channel": "#RELEASE-CHANNEL", "text": "<message>"}) authorized with the bot
token in your slack-bot-token credential. Slack mrkdwn, no markdown headings.

The message:
- First line: ":rocket: *Houston v<version> draft is ready to QA*"
- Then the top items from `notes`, as they are written. They are already user
  facing; do not rewrite them into a changelog and do not add PR numbers.
- Then: "Test the *staging DMG* in the daily: <staging_dmg>"
- Then: "Draft: <release_url>"
Keep it short enough to read without scrolling. If a field is empty, leave that
line out rather than posting an empty link.

If the payload's event is not "draft_ready", ignore it and do nothing.
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
- **Routine A never fires** (pod down, credential broken) — the failure mode with
  no messenger. The heartbeat is the tell: no heartbeat AND no quiet-day line by
  ~07:15 means the routine itself did not run. Recover by dispatching the
  workflow by hand from the Actions tab (the notes inputs are optional — blank
  falls back to the auto-changelog).
- **Routine B never fires / the hand-off POST fails** — `release.yml` falls back
  to its own Slack ping automatically, so the draft is still announced (in the
  plain pre-PRODUCT-1329 format). Two draft messages means the fallback fired
  alongside a late routine B; one plain message means the webhook path is
  broken.

## Related

- The workflow itself: `.github/workflows/daily-cloud-cut.yml` (header documents
  the PAT, tag-only push, and guard rationale).
- The rest of the train: [production-infra.md](production-infra.md).
- Routine mechanics (cron scheduling, team-scope credentials):
  [routine-triggers.md](routine-triggers.md), [ai-accounts.md](ai-accounts.md).
