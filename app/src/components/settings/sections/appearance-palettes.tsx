import type {
  PaletteId,
  ResolvedMode,
  ThemePreference,
} from "@houston/sdk/appearance";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@houston-ai/core";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { chosenPalette, needsModeHint } from "./appearance-model";
import { PaletteTileGroup } from "./appearance-tiles";

interface PalettesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pref: ThemePreference;
  resolved: ResolvedMode;
  onPick: (mode: ResolvedMode, id: PaletteId) => void;
}

export function PalettesDialog({
  open,
  onOpenChange,
  pref,
  resolved,
  onPick,
}: PalettesDialogProps) {
  const { t } = useTranslation(["settings", "common"]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        closeLabel={t("common:actions.close")}
        className="max-h-[85dvh] overflow-y-auto sm:max-w-[min(42rem,calc(100%-2rem))]"
      >
        <DialogHeader>
          <DialogTitle>{t("settings:appearance.palettesTitle")}</DialogTitle>
          <DialogDescription>
            {t("settings:appearance.palettesDescription")}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-6">
          <PaletteSection
            mode="light"
            title={t("settings:appearance.lightSection")}
            hint={
              needsModeHint(resolved, "light")
                ? t("settings:appearance.showsInLight")
                : undefined
            }
            selected={chosenPalette(pref, "light")}
            onSelect={(id) => onPick("light", id)}
          />
          <PaletteSection
            mode="dark"
            title={t("settings:appearance.darkSection")}
            hint={
              needsModeHint(resolved, "dark")
                ? t("settings:appearance.showsInDark")
                : undefined
            }
            selected={chosenPalette(pref, "dark")}
            onSelect={(id) => onPick("dark", id)}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PaletteSection({
  mode,
  title,
  hint,
  selected,
  onSelect,
}: {
  mode: ResolvedMode;
  title: string;
  hint?: string;
  selected: PaletteId;
  onSelect: (id: PaletteId) => void;
}) {
  const headingId = useId();
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h3 id={headingId} className="text-sm font-medium text-ink">
          {title}
        </h3>
        {hint && <p className="text-xs text-ink-muted">{hint}</p>}
      </div>
      <PaletteTileGroup
        mode={mode}
        labelledBy={headingId}
        selected={selected}
        onSelect={onSelect}
      />
    </section>
  );
}
