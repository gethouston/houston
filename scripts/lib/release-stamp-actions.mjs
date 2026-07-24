// Linear-side actions of the release stamp: finding the train's issues and
// stamping each one (labels, state move, ship comment). Orchestrated by
// scripts/linear-release-stamp.mjs; pure derivation lives in release-train.mjs.

import { ISSUE_FIELDS } from "./release-stamp-api.mjs";
import { reporterPhones, semver } from "./release-train.mjs";

const USER_BUG_LABEL = "User Bug";
const APP_REVIEW = "App Review";

/** Find-or-create the Release label group and this tag's label under it. */
export async function ensureTagLabel({ lin, teamId, releaseTag }) {
  const teamData = await lin(
    `query($t: String!) { team(id: $t) {
       states { nodes { id name type } }
       labels(first: 250) { nodes { id name isGroup parent { id } } } } }`,
    { t: teamId },
  );
  const released = teamData.team.states.nodes.find(
    (s) => s.name === "Released",
  );
  if (!released) throw new Error('No "Released" state on team HOU');

  const create = async (input) =>
    (
      await lin(
        `mutation($i: IssueLabelCreateInput!) { issueLabelCreate(input: $i) { issueLabel { id } } }`,
        { i: { teamId, color: "#2da44e", ...input } },
      )
    ).issueLabelCreate.issueLabel;

  let group = teamData.team.labels.nodes.find(
    (l) => l.name === "Release" && l.isGroup,
  );
  if (!group) group = await create({ name: "Release", isGroup: true });
  let tagLabel = teamData.team.labels.nodes.find((l) => l.name === releaseTag);
  if (!tagLabel)
    tagLabel = await create({ name: releaseTag, parentId: group.id });
  return { released, tagLabel };
}

/**
 * The train's issues: magic-word keys + the mode's Linear-side sweep.
 * Draft sweeps everything currently in App Review (App Review means "merged,
 * awaiting verification", so it ships in this build even when its PR forgot
 * the magic words). Publish sweeps the label carriers stamped at cut —
 * post-cut merges lack the label, so they wait for the next train instead of
 * being mis-released.
 */
export async function fetchTargets({ lin, teamId, releaseTag, publish }, keys) {
  const targets = new Map(); // issue id -> { issue, magic }
  for (const key of keys) {
    try {
      const d = await lin(
        `query($k: String!) { issue(id: $k) { ${ISSUE_FIELDS} } }`,
        { k: key },
      );
      targets.set(d.issue.id, { issue: d.issue, magic: true });
    } catch (e) {
      console.warn(`${key}: ${e.message}`);
    }
  }
  const filter = publish
    ? `labels: { name: { eq: "${releaseTag}" } }`
    : `state: { name: { eq: "${APP_REVIEW}" } }`;
  const swept = await lin(
    `query($t: ID!) { issues(first: 200, filter: { team: { id: { eq: $t } }, ${filter} }) {
       nodes { ${ISSUE_FIELDS} } } }`,
    { t: teamId },
  );
  for (const issue of swept.issues.nodes)
    if (!targets.has(issue.id)) targets.set(issue.id, { issue, magic: false });
  return targets;
}

/**
 * Stamp one issue. Labels in both modes; in publish mode also moves it to
 * Released — magic-word issues from any open state, swept issues only from
 * App Review (an issue QA bounced back to In Progress stays put).
 */
export async function stampOne(ctx, { issue, magic }, { released, tagLabel }) {
  const { lin, releaseTag, publish, releaseUrl } = ctx;
  const labelNames = issue.labels.nodes.map((l) => l.name);
  const actions = [];

  // Release labels are an exclusive Linear group: swap a stale train's label
  // (a draft that never shipped) for the current one instead of stacking.
  for (const stale of issue.labels.nodes.filter(
    (l) => semver(l.name) && l.name !== releaseTag,
  )) {
    await lin(
      `mutation($id: String!, $l: String!) { issueRemoveLabel(id: $id, labelId: $l) { success } }`,
      { id: issue.id, l: stale.id },
    );
    actions.push(`unlabeled ${stale.name}`);
  }
  if (!labelNames.includes(releaseTag)) {
    await lin(
      `mutation($id: String!, $l: String!) { issueAddLabel(id: $id, labelId: $l) { success } }`,
      { id: issue.id, l: tagLabel.id },
    );
    actions.push("labeled");
  }

  const done =
    issue.state.type === "completed" || issue.state.type === "canceled";
  if (publish && !done && (magic || issue.state.name === APP_REVIEW)) {
    await lin(
      `mutation($id: String!, $s: String!) { issueUpdate(id: $id, input: { stateId: $s }) { success } }`,
      { id: issue.id, s: released.id },
    );
    await lin(
      `mutation($i: CommentCreateInput!) { commentCreate(input: $i) { success } }`,
      {
        i: {
          issueId: issue.id,
          body: `🚂 Shipped in [${releaseTag}](${releaseUrl})`,
        },
      },
    );
    actions.push("released");
  }
  console.log(`${issue.identifier}: ${actions.join(" + ") || "no-op"}`);

  const isUserBug = labelNames.includes(USER_BUG_LABEL);
  return {
    key: issue.identifier,
    title: issue.title,
    project: issue.project?.name ?? "(no project)",
    isUserBug,
    phones: isUserBug ? reporterPhones(issue.description) : null,
  };
}
