#!/usr/bin/env node
// Linear release stamp — two moments of the release train, one script:
//
//   STAMP_MODE=draft    fired by the cloud-v* TAG PUSH (the daily cut; GitHub
//                       Actions never fires on draft-release creation, but the
//                       tag push that births the draft does). Labels the whole
//                       train with `cloud-vX.Y.Z`: issues resolved by the
//                       train's PRs (magic words) PLUS every issue sitting in
//                       App Review at cut time — App Review means "merged,
//                       awaiting verification", so it ships in this build even
//                       when its PR forgot the magic words. The label IS the
//                       train membership record. A stale label from a train
//                       that never shipped is swapped for the current one
//                       (release labels live in an exclusive Linear group).
//                       No state changes, no comments — the ship decision
//                       hasn't happened yet.
//
//   STAMP_MODE=publish  fired when the release is PUBLISHED (the ship button).
//                       Moves the train to "Released": every issue carrying
//                       this tag's label that is still in App Review (an issue
//                       QA bounced back to In Progress stays put), plus the
//                       magic-word issues as a belt-and-suspenders. Comments
//                       the release link and appends the internal + WhatsApp
//                       changelogs to the release body.
//
// Idempotency: labels are add-if-missing; the state move + comment happen only
// when the issue actually transitions; the body append is guarded by a marker.
// Re-running either mode is safe. If a draft-mode run was lost to a Linear
// outage, re-run the script by hand with the same env — no re-push needed.
//
// Deliberately an OBSERVER: exits 0 on failure so a Linear outage can never
// block or taint a cut or a ship.
//
// Env: LINEAR_API_KEY, GITHUB_TOKEN, REPO (owner/name), STAMP_MODE,
//      RELEASE_TAG; publish mode only: RELEASE_URL, RELEASE_ID.

import {
  ensureTagLabel,
  fetchTargets,
  stampOne,
} from "./lib/release-stamp-actions.mjs";
import {
  makeGithubClient,
  makeLinearClient,
} from "./lib/release-stamp-api.mjs";
import {
  buildInternalChangelog,
  buildWhatsAppDraft,
  issueKeysFromText,
  pickPrevPublished,
  prNumbersFromCommits,
  semver,
} from "./lib/release-train.mjs";

const {
  LINEAR_API_KEY,
  GITHUB_TOKEN,
  REPO,
  STAMP_MODE,
  RELEASE_TAG,
  RELEASE_URL,
  RELEASE_ID,
} = process.env;

const TEAM_ID = "90e0063a-4fc4-4d88-adb6-ea6b0f2a198a"; // Linear team HOU

const gh = makeGithubClient(GITHUB_TOKEN);
const lin = makeLinearClient(LINEAR_API_KEY);

/** Issue keys the train's PRs claim to resolve (magic words). */
async function trainIssueKeys(cur) {
  const releases = await gh(`/repos/${REPO}/releases?per_page=100`);
  const prev = pickPrevPublished(releases, cur);
  if (!prev) {
    console.log(
      "No previous published cloud-v* release; PR scan skipped (first train).",
    );
    return new Set();
  }
  console.log(`Train: ${prev.tag_name} -> ${RELEASE_TAG}`);

  // The compare API caps at 250 commits; a daily train is far below that.
  const compare = await gh(
    `/repos/${REPO}/compare/${prev.tag_name}...${RELEASE_TAG}`,
  );
  if (compare.total_commits > compare.commits.length)
    console.warn(
      `WARNING: compare truncated (${compare.commits.length}/${compare.total_commits}).`,
    );
  const prNumbers = prNumbersFromCommits(compare.commits);
  console.log(`PRs in train: ${[...prNumbers].join(", ") || "none"}`);

  const keys = new Set();
  for (const n of prNumbers) {
    try {
      const pr = await gh(`/repos/${REPO}/pulls/${n}`);
      for (const key of issueKeysFromText(`${pr.title}\n${pr.body || ""}`))
        keys.add(key);
    } catch (e) {
      console.warn(`PR #${n}: ${e.message}`);
    }
  }
  console.log(`Issues from PR magic words: ${[...keys].join(", ") || "none"}`);
  return keys;
}

async function main() {
  const cur = semver(RELEASE_TAG || "");
  if (!cur) {
    console.log(`Tag ${RELEASE_TAG} is not cloud-v*; nothing to do.`);
    return;
  }
  const ctx = {
    lin,
    teamId: TEAM_ID,
    releaseTag: RELEASE_TAG,
    publish: STAMP_MODE === "publish",
    releaseUrl: RELEASE_URL,
  };

  const keys = await trainIssueKeys(cur);
  const labels = await ensureTagLabel(ctx);
  const targets = await fetchTargets(ctx, keys);
  if (targets.size === 0) return console.log("Empty train; nothing to stamp.");

  const stamped = [];
  for (const target of targets.values()) {
    try {
      stamped.push(await stampOne(ctx, target, labels));
    } catch (e) {
      console.warn(`${target.issue.identifier}: ${e.message}`);
    }
  }
  if (stamped.length === 0) return;

  const internal = buildInternalChangelog(stamped, RELEASE_TAG);
  const wa = ctx.publish ? buildWhatsAppDraft(stamped) : "";
  if (ctx.publish) {
    const rel = await gh(`/repos/${REPO}/releases/${RELEASE_ID}`);
    if (!(rel.body || "").includes(`## Linear — ${RELEASE_TAG}`)) {
      await gh(`/repos/${REPO}/releases/${RELEASE_ID}`, {
        method: "PATCH",
        body: JSON.stringify({ body: (rel.body || "") + internal + wa }),
      });
    }
  }
  if (process.env.GITHUB_STEP_SUMMARY) {
    const { appendFileSync } = await import("node:fs");
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, internal + wa);
  }
  console.log(`${STAMP_MODE}: processed ${stamped.length} issues.`);
}

main().catch((e) => {
  // Observer, not a gate: log and exit 0 so a Linear outage never taints a ship.
  console.error(`linear-release-stamp failed (non-blocking): ${e.message}`);
});
