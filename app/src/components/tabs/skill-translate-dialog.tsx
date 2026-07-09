import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  Spinner,
} from "@houston-ai/core";
import { Languages, Sparkles, Zap } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { SkillTranslateMode } from "../../lib/types";

interface SkillTranslateDialogProps {
  open: boolean;
  /** How many skills the just-finished install added. */
  count: number;
  /** The app locale's own display name ("español", "português"). */
  languageName: string;
  /** A translation run is in flight; options disable and the dialog holds. */
  busy: boolean;
  onChoose: (mode: SkillTranslateMode) => void;
  onDismiss: () => void;
}

const OPTIONS = [
  { mode: "machine", Icon: Zap, key: "quick" },
  { mode: "ai", Icon: Sparkles, key: "ai" },
] as const;

/**
 * Post-install translation offer (HOU-733): when the app runs in es/pt and
 * the user installs a marketplace/repo skill, offer to translate the
 * installed SKILL.md into the app language. Two ways in, both explicit:
 * a quick machine pass (free, rough) or an AI pass with the user's own
 * provider (better, slower). Dismissing keeps the original untouched.
 */
export function SkillTranslateDialog({
  open,
  count,
  languageName,
  busy,
  onChoose,
  onDismiss,
}: SkillTranslateDialogProps) {
  const { t } = useTranslation("skills");
  return (
    <Dialog open={open} onOpenChange={(next) => !next && !busy && onDismiss()}>
      <DialogContent className="sm:max-w-md">
        <DialogTitle className="flex items-center gap-2">
          <Languages className="size-4 text-muted-foreground" />
          {t("translate.title", { language: languageName })}
        </DialogTitle>
        <DialogDescription>
          {t("translate.description", { count, language: languageName })}
        </DialogDescription>
        <div className="flex flex-col gap-2">
          {OPTIONS.map(({ mode, Icon, key }) => (
            <button
              key={mode}
              type="button"
              disabled={busy}
              onClick={() => onChoose(mode)}
              className="flex items-start gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
            >
              <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <span>
                <span className="block text-sm font-medium">
                  {t(`translate.${key}.title`)}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {t(`translate.${key}.description`)}
                </span>
              </span>
            </button>
          ))}
        </div>
        <DialogFooter>
          {busy ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner className="size-3.5" />
              {t("translate.inProgress")}
            </div>
          ) : (
            <Button variant="ghost" onClick={onDismiss}>
              {t("translate.keep")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
