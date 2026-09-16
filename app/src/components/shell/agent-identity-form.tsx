import {
  AGENT_COLORS,
  HoustonAvatar,
  Input,
  resolveAgentColor,
} from "@houston-ai/core";
import { FolderOpen, X } from "lucide-react";
import { type FormEvent, type ReactNode, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { tutorialAnchor } from "../tutorial";
import { AgentColorPalette } from "./agent-color-palette";

export interface AgentIdentityFormProps {
  /** Ties the form to the primary in the sheet's bottom bar, which submits it
   *  from outside the element. */
  formId: string;
  /** What this screen says under the live avatar: the brief's two answers in
   *  the guided setup, the source agent's name in the copy wizard. What the
   *  screen ASKS for is the sheet's own title, never a second headline here. */
  header: ReactNode;
  name: string;
  color: string | undefined;
  error: string | null;
  existingPath: string | null;
  nameInvalid?: boolean;
  showLinkProject?: boolean;
  onNameChange: (value: string) => void;
  onColorChange: (value: string) => void;
  onExistingPathChange: (path: string | null) => void;
  onSubmit: (e: FormEvent) => void;
}

/* The tint behind the helmet and the helmet's own fill are two elements, so
   both carry the fade: the badge is this component's, the glyph inside it is
   the shared avatar's. */
const AVATAR_COLOR_FADE =
  "transition-colors duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] [&_svg]:transition-colors [&_svg]:duration-200 [&_svg]:ease-[cubic-bezier(0.16,1,0.3,1)]";

/**
 * The identity a new agent gets before it exists: its face, its color and its
 * name. Shared by every path that makes an agent (from scratch, or copied from
 * one you already have) so they end on the same screen.
 *
 * Everything stands on ONE centred axis, face first: the screen asks for a
 * name and a colour, and a portrait is the shape that reads as an identity.
 *
 * The avatar is the live preview, not decoration: it wears the colour under the
 * cursor, so the palette is answered by looking up rather than by imagining.
 * It fades into each new colour instead of cutting to it (motion tokens:
 * `duration.fast` + `easing.entrance`), which is what makes the palette feel
 * like it paints the face rather than swapping it.
 *
 * The action itself is NOT here: it is the sheet's bottom bar, pinned under
 * the scrolling body at both widths, where every other step of every other
 * flow puts its primary. The form is reached from there by id, so Enter in the
 * name field and a press on the bar are the same submit.
 */
export function AgentIdentityForm({
  formId,
  header,
  name,
  color,
  error,
  existingPath,
  nameInvalid,
  showLinkProject,
  onNameChange,
  onColorChange,
  onExistingPathChange,
  onSubmit,
}: AgentIdentityFormProps) {
  const { t } = useTranslation(["shell", "agentOnboarding"]);
  const resolvedColor = resolveAgentColor(color);

  useEffect(() => {
    if (!color) {
      onColorChange(AGENT_COLORS[0].id);
    }
  }, [color, onColorChange]);

  return (
    <div className="flex w-full flex-col items-center gap-6 text-center">
      <HoustonAvatar
        color={resolvedColor}
        diameter={64}
        className={AVATAR_COLOR_FADE}
      />
      {header}

      <div
        {...tutorialAnchor("createAgentNaming")}
        className="flex w-full max-w-sm flex-col gap-6"
      >
        <AgentColorPalette color={color} onColorChange={onColorChange} />

        <form id={formId} onSubmit={onSubmit} className="flex flex-col gap-4">
          <Input
            autoFocus
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder={t("naming.namePlaceholder")}
            aria-label={t("naming.dialogTitle")}
            aria-invalid={nameInvalid || undefined}
            className="h-11 rounded-full px-4 text-center md:h-10"
          />

          {showLinkProject && (
            <div className="flex flex-col items-center gap-1.5">
              {existingPath ? (
                <div className="flex items-center gap-2 rounded-full bg-chip px-3 py-1.5 text-xs text-ink-muted">
                  <FolderOpen className="size-3" />
                  <span className="max-w-[200px] truncate">
                    {existingPath.split("/").pop()}
                  </span>
                  <button
                    type="button"
                    onClick={() => onExistingPathChange(null)}
                    aria-label={t("agentOnboarding:roleSetup.unlinkProject")}
                    className="ml-1 text-ink-muted hover:text-ink"
                  >
                    <X className="size-3" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={async () => {
                    const { tauriAgents } = await import("../../lib/tauri");
                    const picked = await tauriAgents.pickDirectory();
                    if (picked) {
                      onExistingPathChange(picked);
                      if (!name.trim()) {
                        const folderName =
                          picked.replace(/\/$/, "").split("/").pop() ?? "";
                        onNameChange(folderName);
                      }
                    }
                  }}
                  className="flex items-center gap-1.5 text-xs text-ink-muted transition-colors hover:text-ink"
                >
                  <FolderOpen className="size-3" />
                  {t("naming.linkExistingProject")}
                </button>
              )}
            </div>
          )}

          {error && (
            <p role="alert" className="text-xs text-danger">
              {error}
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
