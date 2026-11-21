export function semver(tag) {
  const m = (tag || "").match(/^cloud-v(\d+)\.(\d+)\.(\d+)$/);
  return m ? m.slice(1).map(Number) : null;
}

export function cmpSemver(a, b) {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

export function pickPrevPublished(releases, cur) {
  return (
    releases
      .filter((r) => !r.draft && semver(r.tag_name))
      .filter((r) => cmpSemver(semver(r.tag_name), cur) < 0)
      .sort((a, b) => cmpSemver(semver(b.tag_name), semver(a.tag_name)))[0] ??
    null
  );
}

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

export function issueKeysFromText(text) {
  const MAGIC =
    /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s*:?\s*(HOU-\d+(?:\s*,\s*(?:and\s+)?HOU-\d+)*)/gi;
  const keys = new Set();
  for (const m of text.matchAll(MAGIC))
    for (const key of m[1].match(/HOU-\d+/g)) keys.add(key);
  return keys;
}

export function reporterPhones(description) {
  return (
    (description || "")
      .match(/Reporter phone\(s\):\*{0,2}\s*([^\n]+)/)?.[1]
      ?.trim() ?? null
  );
}

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
