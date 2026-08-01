import { Button } from "@houston-ai/core";
import type { InstalledSkillEditorState } from "@houston-ai/skills";
import { SkillEditModal } from "@houston-ai/skills";
import type { ReactNode } from "react";
import { useState } from "react";

import type { SpecimenProp } from "../../../src/specimen";
import { delay } from "./sample";

/**
 * The edit-modal harness and its props table. Exports no `specimen` and no
 * `sources`.
 */

/** The named app badges `app/` renders into the header. */
export function integrationsSlot(): ReactNode {
  return (
    <div className="flex flex-wrap gap-1.5 pt-1">
      {["Gmail", "Google Drive"].map((name) => (
        <span
          key={name}
          className="rounded-full border border-line px-2.5 py-0.5 text-ink text-xs"
        >
          {name}
        </span>
      ))}
    </div>
  );
}

export function EditDemo({
  label,
  displayName,
  description,
  editor,
  withDelete = false,
  withIntegrations = false,
  variant,
}: {
  label: string;
  displayName: string;
  description: string;
  editor: InstalledSkillEditorState;
  withDelete?: boolean;
  withIntegrations?: boolean;
  variant?: "outline" | "secondary";
}) {
  const [open, setOpen] = useState(false);
  const [deleted, setDeleted] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <Button variant={variant} onClick={() => setOpen(true)}>
        {label}
      </Button>
      <SkillEditModal
        open={open}
        onOpenChange={setOpen}
        displayName={displayName}
        description={description}
        integrationsSlot={withIntegrations ? integrationsSlot() : undefined}
        editor={editor}
        onSave={async () => {
          await delay(900);
          setOpen(false);
        }}
        onDelete={
          withDelete
            ? () => {
                setDeleted(true);
                setOpen(false);
              }
            : undefined
        }
      />
      {deleted && (
        <p className="text-[13px] text-ink-muted leading-[1.4]">
          Delete opens the host's confirm dialog — the modal itself never
          destroys anything.
        </p>
      )}
    </div>
  );
}

/** `SkillEditModalProps`, read off `ui/skills/src/skill-edit-modal.tsx`. */
export const editProps: SpecimenProp[] = [
  {
    name: "open",
    type: "boolean",
    note: "Controlled by the host, which also clears the editing skill on a successful save.",
  },
  {
    name: "onOpenChange",
    type: "(open: boolean) => void",
    note: "Required. Cancel routes through it.",
  },
  {
    name: "displayName",
    type: "string",
    note: "The localized title, truncated to one line.",
  },
  {
    name: "description",
    type: "string",
    note: "The one-liner under the title, clamped to two lines. Empty renders nothing.",
  },
  {
    name: "integrationsSlot",
    type: "ReactNode",
    note: "The apps this skill works with, resolved by `app/`. A node that renders `null` opens no gap.",
  },
  {
    name: "editor",
    type: "InstalledSkillEditorState",
    note: "`idle` | `loading` | `ready` | `error` — derive it with `deriveInstalledSkillEditorState`.",
  },
  {
    name: "onSave",
    type: "(content: string) => Promise<void>",
    note: "Commits the draft. Save is disabled until dirty and reads Saving... in flight; a rejection propagates to the caller's toast.",
  },
  {
    name: "onDelete",
    type: "() => void",
    note: "Opens the host's delete confirm. Omit it — a read-only agent — and the footer carries no destructive action.",
  },
  {
    name: "labels",
    type: "SkillEditModalLabels",
    note: "Save, Saving, Cancel, Delete, the textarea placeholder and the load-error line. Already translated.",
  },
];
