export interface RepoViewLabels {
  sourcePlaceholder?: string;
  findSkills?: string;
  installSelected?: (count: number) => string;
  skillsFound?: (count: number) => string;
  selectAll?: string;
  deselectAll?: string;
  inputHint?: string;
  installedSummary?: (count: number, names: string) => string;
  installAnotherRepo?: string;
}

export const DEFAULT_REPO_VIEW_LABELS: Required<RepoViewLabels> = {
  sourcePlaceholder: "owner/repo",
  findSkills: "Find skills",
  installSelected: (count) => `Install ${count}`,
  skillsFound: (count) => `${count} skill${count === 1 ? "" : "s"} found`,
  selectAll: "Select all",
  deselectAll: "Deselect all",
  inputHint: "Enter a public GitHub repo in owner/repo format",
  installedSummary: (count, names) =>
    `Installed ${count} skill${count === 1 ? "" : "s"}: ${names}`,
  installAnotherRepo: "Install from another repo",
};
