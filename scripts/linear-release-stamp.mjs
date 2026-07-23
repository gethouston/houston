#!/usr/bin/env node
// Linear release stamp — runs when a cloud-v* draft release is PUBLISHED (the
// ship button). Downstream observer only: it must never block or fail a ship.
//
// What it does, per train:
//   1. Diff this cloud-v* tag against the previous PUBLISHED cloud-v* release.
//   2. Collect the PRs merged in between; extract `Fixes HOU-N` magic words
//      from their bodies (the convention in the workspace CLAUDE.md).
//   3. In Linear: apply a `cloud-vX.Y.Z` label (under the "Release" label
//      group), move each issue to "Released" (never demoting Done/canceled),
//      and comment a link to the release. Idempotent: an issue already carrying
//      the release label is skipped, so re-running the workflow is safe.
//   4. Append two changelogs to the GitHub release body: an internal list
//      grouped by Linear project, and a WhatsApp draft with the reporter phone
//      numbers pulled from User Bug issues (drives the notify-the-reporter
//      step).
//
// Env: LINEAR_API_KEY, GITHUB_TOKEN, REPO (owner/name), RELEASE_TAG,
//      RELEASE_URL, RELEASE_ID.

const {
  LINEAR_API_KEY,
  GITHUB_TOKEN,
  REPO,
  RELEASE_TAG,
  RELEASE_URL,
  RELEASE_ID,
} = process.env;

const TEAM_ID = "90e0063a-4fc4-4d88-adb6-ea6b0f2a198a"; // Linear team HOU
const USER_BUG_LABEL = "User Bug";

async function gh(path, init = {}) {
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      ...(init.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`GitHub ${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

async function lin(query, variables = {}) {
  const res = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: LINEAR_API_KEY },
    body: JSON.stringify({ query, variables }),
  });
  const data = await res.json();
  if (data.errors) throw new Error(`Linear: ${JSON.stringify(data.errors).slice(0, 300)}`);
  return data.data;
}

function semver(tag) {
  const m = tag.match(/^cloud-v(\d+)\.(\d+)\.(\d+)$/);
  return m ? m.slice(1).map(Number) : null;
}

function cmp(a, b) {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

async function main() {
  const cur = semver(RELEASE_TAG);
  if (!cur) {
    console.log(`Tag ${RELEASE_TAG} is not cloud-v*; nothing to do.`);
    return;
  }

  // 1. Previous published cloud-v* release (drafts excluded; prereleases count —
  // cloud releases are deliberately kept prerelease, see daily-cloud-cut.yml).
  const releases = await gh(`/repos/${REPO}/releases?per_page=100`);
  const prev = releases
    .filter((r) => !r.draft && semver(r.tag_name) && cmp(semver(r.tag_name), cur) < 0)
    .sort((a, b) => cmp(semver(b.tag_name), semver(a.tag_name)))[0];
  if (!prev) {
    console.log("No previous published cloud-v* release found; skipping (first train).");
    return;
  }
  console.log(`Train: ${prev.tag_name} -> ${RELEASE_TAG}`);

  // 2. PRs merged between the two cut points. The compare API caps at 250
  // commits; a daily train is far below that, but log loudly if truncated.
  const compare = await gh(`/repos/${REPO}/compare/${prev.tag_name}...${RELEASE_TAG}`);
  if (compare.total_commits > compare.commits.length)
    console.warn(`WARNING: compare truncated (${compare.commits.length}/${compare.total_commits} commits).`);
  const prNumbers = new Set();
  for (const c of compare.commits) {
    const m = c.commit.message.match(/\(#(\d+)\)/);
    if (m) prNumbers.add(Number(m[1]));
  }
  console.log(`PRs in train: ${[...prNumbers].join(", ") || "none"}`);

  const MAGIC = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s*:?\s*(HOU-\d+(?:\s*,\s*(?:and\s+)?HOU-\d+)*)/gi;
  const issueKeys = new Set();
  for (const n of prNumbers) {
    try {
      const pr = await gh(`/repos/${REPO}/pulls/${n}`);
      const text = `${pr.title}\n${pr.body || ""}`;
      for (const m of text.matchAll(MAGIC))
        for (const key of m[1].match(/HOU-\d+/g)) issueKeys.add(key);
    } catch (e) {
      console.warn(`PR #${n}: ${e.message}`);
    }
  }
  console.log(`Linear issues: ${[...issueKeys].join(", ") || "none"}`);
  if (issueKeys.size === 0) return;

  // 3. Linear: Released state + release label (created under the "Release"
  // group on first use) + comment.
  const teamData = await lin(
    `query($t: String!) { team(id: $t) {
       states { nodes { id name type } }
       labels(first: 250) { nodes { id name isGroup parent { id } } } } }`,
    { t: TEAM_ID },
  );
  const released = teamData.team.states.nodes.find((s) => s.name === "Released");
  if (!released) throw new Error('No "Released" state on team HOU');

  let group = teamData.team.labels.nodes.find((l) => l.name === "Release" && l.isGroup);
  if (!group) {
    const r = await lin(
      `mutation($i: IssueLabelCreateInput!) { issueLabelCreate(input: $i) { issueLabel { id } } }`,
      { i: { teamId: TEAM_ID, name: "Release", isGroup: true, color: "#2da44e" } },
    );
    group = r.issueLabelCreate.issueLabel;
  }
  let tagLabel = teamData.team.labels.nodes.find((l) => l.name === RELEASE_TAG);
  if (!tagLabel) {
    const r = await lin(
      `mutation($i: IssueLabelCreateInput!) { issueLabelCreate(input: $i) { issueLabel { id } } }`,
      { i: { teamId: TEAM_ID, name: RELEASE_TAG, parentId: group.id, color: "#2da44e" } },
    );
    tagLabel = r.issueLabelCreate.issueLabel;
  }

  const stamped = [];
  for (const key of issueKeys) {
    try {
      const d = await lin(
        `query($k: String!) { issue(id: $k) {
           id identifier title description
           state { name type }
           project { name }
           labels { nodes { id name } } } }`,
        { k: key },
      );
      const issue = d.issue;
      const labelNames = issue.labels.nodes.map((l) => l.name);
      const alreadyStamped = labelNames.includes(RELEASE_TAG);
      const isUserBug = labelNames.includes(USER_BUG_LABEL);
      const phones =
        (issue.description || "").match(/Reporter phone\(s\):\*{0,2}\s*([^\n]+)/)?.[1]?.trim() ?? null;

      if (!alreadyStamped) {
        await lin(`mutation($id: String!, $l: String!) { issueAddLabel(id: $id, labelId: $l) { success } }`, {
          id: issue.id,
          l: tagLabel.id,
        });
        if (issue.state.name !== "Done" && issue.state.type !== "canceled") {
          await lin(`mutation($id: String!, $s: String!) { issueUpdate(id: $id, input: { stateId: $s }) { success } }`, {
            id: issue.id,
            s: released.id,
          });
        }
        await lin(`mutation($i: CommentCreateInput!) { commentCreate(input: $i) { success } }`, {
          i: { issueId: issue.id, body: `🚂 Shipped in [${RELEASE_TAG}](${RELEASE_URL})` },
        });
      }
      stamped.push({
        key: issue.identifier,
        title: issue.title,
        project: issue.project?.name ?? "(no project)",
        isUserBug,
        phones: isUserBug ? phones : null,
      });
      console.log(`${issue.identifier}: ${alreadyStamped ? "already stamped" : "stamped"}`);
    } catch (e) {
      console.warn(`${key}: ${e.message}`);
    }
  }
  if (stamped.length === 0) return;

  // 4. Changelogs appended to the release body.
  const byProject = new Map();
  for (const s of stamped) {
    if (!byProject.has(s.project)) byProject.set(s.project, []);
    byProject.get(s.project).push(s);
  }
  let internal = `\n\n---\n## Linear — ${RELEASE_TAG}\n`;
  for (const [project, items] of [...byProject.entries()].sort()) {
    internal += `\n**${project}**\n`;
    for (const s of items) internal += `- ${s.key} — ${s.title}${s.isUserBug ? " 🐛" : ""}\n`;
  }

  const bugs = stamped.filter((s) => s.isUserBug);
  let wa = `\n## WhatsApp draft\n\n\`\`\`\n🚀 Nueva versión de Houston!\n`;
  for (const s of stamped) wa += `✅ ${s.title}\n`;
  wa += `Gracias a todos los que reportaron 🙌\n\`\`\`\n`;
  if (bugs.length) {
    wa += `\n**Notify reporters** (then clear the \`Notify pending\` label):\n`;
    for (const b of bugs) wa += `- ${b.key} → ${b.phones ?? "⚠️ no phone on issue"}\n`;
  }

  const rel = await gh(`/repos/${REPO}/releases/${RELEASE_ID}`);
  if (!(rel.body || "").includes(`## Linear — ${RELEASE_TAG}`)) {
    await gh(`/repos/${REPO}/releases/${RELEASE_ID}`, {
      method: "PATCH",
      body: JSON.stringify({ body: (rel.body || "") + internal + wa }),
    });
  }
  if (process.env.GITHUB_STEP_SUMMARY) {
    const { appendFileSync } = await import("node:fs");
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, internal + wa);
  }
  console.log(`Stamped ${stamped.length} issues; changelogs appended to the release.`);
}

main().catch((e) => {
  // Observer, not a gate: log and exit 0 so a Linear outage never taints a ship.
  console.error(`linear-release-stamp failed (non-blocking): ${e.message}`);
});
