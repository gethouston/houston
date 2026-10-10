import type { OrgTree, OrgTreeCaps } from "./org-chart-tree.ts";

/**
 * What sharing the org chart says and where it can go. Pure and DOM-free:
 * the post text, the image's file name, LinkedIn's share link, and which
 * share actions this browser can actually perform.
 */

/**
 * What the square share image holds (`org-chart-share-layout.ts`): six
 * people across, three AI Employees under each, then "+N".
 */
export const SHARE_CARD_CAPS: OrgTreeCaps = {
  people: 6,
  agentsPerPerson: 3,
  rootAgents: 6,
};

/** The subset of i18next's `t` the post builder needs. */
export type Translate = (
  key: string,
  options?: Record<string, unknown>,
) => string;

/**
 * The prefilled post: who is on the chart in counts and the space's name,
 * then where to get Houston. A personal space speaks in the first person.
 */
export function sharePostText(t: Translate, tree: OrgTree): string {
  const agents = t("orgChart.agentCount", { count: tree.counts.agents });
  if (tree.root.kind === "person")
    return t("orgChart.share.postPersonal", { agents });
  const people = t("orgChart.peopleCount", { count: tree.counts.people });
  return t("orgChart.share.post", {
    company: tree.root.name,
    people,
    agents,
  });
}

/** The name the chart is drawn under: the space, or the personal space's person. */
export function shareTitle(tree: OrgTree): string {
  return tree.root.kind === "person" ? tree.root.person.name : tree.root.name;
}

/**
 * `<company>-org-chart.png`, safe on every file system: accents folded,
 * anything but letters and digits collapsed to one hyphen, capped so a long
 * name never makes an unwieldy file. A name with nothing usable left is
 * just `org-chart.png`.
 */
export function shareFileName(company: string): string {
  const slug = company
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
  return slug ? `${slug}-org-chart.png` : "org-chart.png";
}

/**
 * LinkedIn's compose link with the post text filled in. It cannot carry an
 * image, so the dialog tells the person to attach the downloaded one.
 */
export function linkedInShareUrl(text: string): string {
  return `https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(text)}`;
}

/** The ways this browser can hand the image on. */
export interface ShareAbilities {
  /** `navigator.clipboard.write` with `ClipboardItem`: copy the PNG itself. */
  copyImage: boolean;
  /** The native share sheet takes files (phones, some desktops). */
  nativeShare: boolean;
}

/** The slice of `navigator` and `window` the detection reads. */
export interface ShareEnvironment {
  clipboard?: { write?: unknown };
  ClipboardItem?: unknown;
  share?: unknown;
  canShare?: (data: { files: File[] }) => boolean;
}

export function shareAbilities(
  env: ShareEnvironment,
  file: File | null,
): ShareAbilities {
  const copyImage =
    typeof env.clipboard?.write === "function" &&
    typeof env.ClipboardItem === "function";
  const nativeShare =
    file !== null &&
    typeof env.share === "function" &&
    typeof env.canShare === "function" &&
    env.canShare({ files: [file] });
  return { copyImage, nativeShare };
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

/** The channels a share is tracked under. */
export type ShareChannel = "linkedin" | "download" | "copy_image" | "native";
