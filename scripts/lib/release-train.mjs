// Pure logic for the Linear release stamp: deriving the train from GitHub
// data and rendering the changelogs. No network — see linear-release-stamp.mjs
// for the orchestration and scripts/lib/release-stamp-api.mjs for the clients.

/** Parse a cloud-vX.Y.Z tag into [X, Y, Z], or null for anything else. */
export function semver(tag) {
  const m = (tag || "").match(/^cloud-v(\d+)\.(\d+)\.(\d+)$/);
  return m ? m.slice(1).map(Number) : null;
}

export function cmpSemver(a, b) {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

/**
 * The previous PUBLISHED cloud-v* release (drafts excluded; prereleases count —
 * cloud releases are deliberately kept prerelease, see daily-cloud-cut.yml).
 * The train is everything merged between that release and the current tag, so
 * a draft that was never shipped rolls its work forward into the next train.
 */
export function pickPrevPublished(releases, cur) {
  return (
    releases
      .filter((r) => !r.draft && semver(r.tag_name))
      .filter((r) => cmpSemver(semver(r.tag_name), cur) < 0)
      .sort((a, b) => cmpSemver(semver(b.tag_name), semver(a.tag_name)))[0] ??
    null
  );
}

/**
 * PR numbers from a compare range's commit subjects. Two merge styles land on
 * main: squash ("title (#123)") and merge commits ("Merge pull request #123
 * from ..."). The old squash-only regex silently dropped every merge-commit
 * PR from the train — the root cause of unlabeled App Review issues.
 */
export function prNumbersFromCommits(commits) {
  const numbers = new Set();
  for (const c of commits) {
    const subject = c.commit.message.split("\n")[0];
    const m =
      subject.match(/\(#(\d+)\)$/) ??
      subject.match(/^Merge pull request #(\d+)/);
    if (m) numbers.add(Number(m[1]));
  }
  return numbers;
}

/**
 * Issue keys a PR claims to RESOLVE (magic words only — Linear parses the
 * same). Bare "HOU-x" mentions are deliberately not enough to move an issue:
 * a PR that says "context: HOU-500" must not release HOU-500. Issues merged
 * without magic words are still swept into the train by the App Review
 * labeling in draft mode.
 */
export function issueKeysFromText(text) {
  const MAGIC =
    /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s*:?\s*(HOU-\d+(?:\s*,\s*(?:and\s+)?HOU-\d+)*)/gi;
  const keys = new Set();
  for (const m of text.matchAll(MAGIC))
    for (const key of m[1].match(/HOU-\d+/g)) keys.add(key);
  return keys;
}

/** Reporter phones from a User Bug description's "Reporter phone(s):" line. */
export function reporterPhones(description) {
  return (
    (description || "")
      .match(/Reporter phone\(s\):\*{0,2}\s*([^\n]+)/)?.[1]
      ?.trim() ?? null
  );
}

/** Internal changelog: issues grouped by Linear project. */
export function buildInternalChangelog(stamped, releaseTag) {
  const byProject = new Map();
  for (const s of stamped) {
    if (!byProject.has(s.project)) byProject.set(s.project, []);
    byProject.get(s.project).push(s);
  }
  let out = `\n\n---\n## Linear — ${releaseTag}\n`;
  for (const [project, items] of [...byProject.entries()].sort()) {
    out += `\n**${project}**\n`;
    for (const s of items)
      out += `- ${s.key} — ${s.title}${s.isUserBug ? " 🐛" : ""}\n`;
  }
  return out;
}

/** WhatsApp draft + the notify-reporters checklist for User Bugs. */
export function buildWhatsAppDraft(stamped) {
  let wa = `\n## WhatsApp draft\n\n\`\`\`\n🚀 Nueva versión de Houston!\n`;
  for (const s of stamped) wa += `✅ ${s.title}\n`;
  wa += `Gracias a todos los que reportaron 🙌\n\`\`\`\n`;
  const bugs = stamped.filter((s) => s.isUserBug);
  if (bugs.length) {
    wa += `\n**Notify reporters** (then clear the \`Notify pending\` label):\n`;
    for (const b of bugs)
      wa += `- ${b.key} → ${b.phones ?? "⚠️ no phone on issue"}\n`;
  }
  return wa;
}
