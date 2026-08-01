import { Button } from "@houston-ai/core";
import type { CommunitySkill, SkillPreviewState } from "@houston-ai/skills";
import { SkillPreviewModal } from "@houston-ai/skills";
import type { ReactNode } from "react";
import { useState } from "react";

import type { SpecimenProp } from "../../../src/specimen";

/**
 * The preview harness, the app-side integrations renderer it takes, and its
 * props table. Exports no `specimen` and no `sources`.
 */

/** What `app/` passes for `renderIntegrations`: a slug resolved to a real app. */
const APP_NAMES: Record<string, string> = {
  gmail: "Gmail",
  googledrive: "Google Drive",
  googlecalendar: "Google Calendar",
};

export function renderIntegrations(slugs: string[]): ReactNode {
  return (
    <div>
      <p className="mb-2 font-medium text-ink-muted text-xs">Works with</p>
      <div className="flex flex-wrap gap-1.5">
        {slugs.map((slug) => (
          <span
            key={slug}
            className="rounded-full border border-line px-2.5 py-0.5 text-ink text-xs"
          >
            {APP_NAMES[slug] ?? slug}
          </span>
        ))}
      </div>
    </div>
  );
}

/** The modal behind its own trigger — every row opens the real thing. */
export function PreviewDemo({
  label,
  skill,
  preview,
  installing = false,
  installed = false,
  withIntegrations = false,
  variant,
}: {
  label: string;
  skill: CommunitySkill;
  preview: SkillPreviewState;
  installing?: boolean;
  installed?: boolean;
  withIntegrations?: boolean;
  variant?: "outline" | "secondary";
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}>
        {label}
      </Button>
      <SkillPreviewModal
        open={open}
        onOpenChange={setOpen}
        skill={skill}
        preview={preview}
        installing={installing}
        installed={installed}
        onInstall={() => setOpen(false)}
        renderIntegrations={withIntegrations ? renderIntegrations : undefined}
      />
    </>
  );
}

/** `SkillPreviewModalProps`, read off `ui/skills/src/skill-preview-modal.tsx`. */
export const previewProps: SpecimenProp[] = [
  {
    name: "open",
    type: "boolean",
    note: "Controlled. The marketplace opens it by setting the skill it is showing.",
  },
  {
    name: "onOpenChange",
    type: "(open: boolean) => void",
    note: "Required.",
  },
  {
    name: "skill",
    type: "CommunitySkill | null",
    note: "The row that was clicked. `null` renders an empty shell — the modal never guesses a title.",
  },
  {
    name: "preview",
    type: "SkillPreviewState",
    note: "`loading` | `loaded` | `error` — the on-demand SKILL.md fetch. Sections appear only where the loaded preview carries them.",
  },
  {
    name: "installing",
    type: "boolean",
    note: "The install button spins and locks.",
  },
  {
    name: "installed",
    type: "boolean",
    note: "The button reads Installed and stays disabled.",
  },
  {
    name: "onInstall",
    type: "() => void",
    note: "The full-width install button. Stays enabled after a failed description fetch — a load error never blocks installing.",
  },
  {
    name: "renderIntegrations",
    type: "(slugs: string[]) => ReactNode",
    note: "Renders the apps the skill connects to. Owned by `app/` (resolving a slug to a name and logo is a Composio concern); omitted, the section doesn't show.",
  },
  {
    name: "labels",
    type: "SkillPreviewSheetLabels",
    note: "Every string, plus `formatCategory` for localizing an authored category. Already translated.",
  },
];
