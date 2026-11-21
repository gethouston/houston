import type { OrgTree, OrgTreeCaps } from "./org-chart-tree.ts";

export const SHARE_CARD_CAPS: OrgTreeCaps = {
  people: 4,
  agentsPerPerson: 4,
  rootAgents: 6,
};

export const SHARE_TEAM_COLUMNS = 4;

export function shareCardCaps(people: number): OrgTreeCaps {
  return people > SHARE_TEAM_COLUMNS
    ? { ...SHARE_CARD_CAPS, people: SHARE_TEAM_COLUMNS - 1 }
    : SHARE_CARD_CAPS;
}

export type Translate = (
  key: string,
  options?: Record<string, unknown>,
) => string;

export function sharePostText(t: Translate, tree: OrgTree): string {
  return tree.root.kind === "person"
    ? t("orgChart.share.postPersonal")
    : t("orgChart.share.post", { company: tree.root.name });
}

export function shareAltText(t: Translate, tree: OrgTree): string {
  return t("orgChart.share.altText", { name: shareTitle(tree) });
}

export function shareTitle(tree: OrgTree): string {
  return tree.root.kind === "person" ? tree.root.person.name : tree.root.name;
}

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

export function linkedInShareUrl(text: string): string {
  return `https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(text)}`;
}

export function isShareCancel(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "AbortError"
  );
}

export function isShareBusy(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "InvalidStateError"
  );
}

export type ShareChannel =
  | "linkedin_post"
  | "linkedin"
  | "linkedin_download"
  | "linkedin_text_only"
  | "native"
  | "download"
  | "copy_image";
