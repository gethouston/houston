import type { OrgTree, OrgTreeCaps } from "./org-chart-tree.ts";

/**
 * What sharing the org chart says and where it goes. Pure and DOM-free:
 * the post text, the image's file name and LinkedIn's share link.
 */

/**
 * What the share image holds (`org-chart-share-layout.ts`): four people
 * across with four AI Employees under each, or a personal space's six AI
 * Employees, then "+N". At these caps the fullest chart still fits the
 * portrait frame at the minimum type (`SHARE_MIN_TYPE`).
 */
export const SHARE_CARD_CAPS: OrgTreeCaps = {
  people: 4,
  agentsPerPerson: 4,
  rootAgents: 6,
};

/** The most columns a team's first row holds, its "+N people" included. */
export const SHARE_TEAM_COLUMNS = 4;

/**
 * The caps for a team of `people`, so its first row and its "+N people" fit
 * {@link SHARE_TEAM_COLUMNS}: four people show, five or more show three and
 * "+N". `buildOrgTree` picks who shows in one ranked pass (owners, then people
 * with AI Employees, then the rest), so the cut never drops someone with AI
 * Employees for someone without; the counts line still names everyone.
 */
export function shareCardCaps(people: number): OrgTreeCaps {
  return people > SHARE_TEAM_COLUMNS
    ? { ...SHARE_CARD_CAPS, people: SHARE_TEAM_COLUMNS - 1 }
    : SHARE_CARD_CAPS;
}

/** The subset of i18next's `t` the post builder needs. */
export type Translate = (
  key: string,
  options?: Record<string, unknown>,
) => string;

/**
 * The post that goes with the image, ending with the site and no link: the
 * picture is the post. A personal space speaks of the person's own AI
 * Employees.
 */
export function sharePostText(t: Translate, tree: OrgTree): string {
  return tree.root.kind === "person"
    ? t("orgChart.share.postPersonal")
    : t("orgChart.share.post", { company: tree.root.name });
}

/** What the picture shows, for people who cannot see it. */
export function shareAltText(t: Translate, tree: OrgTree): string {
  return t("orgChart.share.altText", { name: shareTitle(tree) });
}

/** The name the chart is drawn under: the space, or the personal space's person. */
export function shareTitle(tree: OrgTree): string {
  return tree.root.kind === "person" ? tree.root.person.name : tree.root.name;
}

/**
 * `<company>-org-chart.<ext>`, safe on every file system: accents folded,
 * anything but letters and digits collapsed to one hyphen, capped so a long
 * name never makes an unwieldy file. A name with nothing usable left is
 * just `org-chart.<ext>`.
 */
export function shareFileName(company: string, ext: "png" | "jpg" = "png") {
  const slug = company
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
  return slug ? `${slug}-org-chart.${ext}` : `org-chart.${ext}`;
}

/**
 * LinkedIn's compose link with the post text filled in. It cannot carry an
 * image: the person pastes the copied one, or adds the downloaded one.
 */
export function linkedInShareUrl(text: string): string {
  return `https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(text)}`;
}

/** Whether a share sheet rejection is the person closing it, not a failure. */
export function isShareCancel(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "AbortError"
  );
}

/**
 * Whether a share sheet rejection is the sheet already being open (a second
 * tap while it is up): the first share is still running, not a failure.
 */
export function isShareBusy(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "InvalidStateError"
  );
}

/**
 * How a share left, as tracked: posted to LinkedIn by Houston, LinkedIn's
 * composer with the image copied, saved, or with no image, the share sheet,
 * or the dialog's Download image and Copy image.
 */
export type ShareChannel =
  | "linkedin_post"
  | "linkedin"
  | "linkedin_download"
  | "linkedin_text_only"
  | "native"
  | "download"
  | "copy_image";
