import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@houston-ai/core";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import type {
  PaletteId,
  ResolvedMode,
  ThemePreference,
} from "../../../lib/theme-model";
import { chosenPalette, needsModeHint } from "./appearance-model";
import { PaletteTileGroup } from "./appearance-tiles";

/**
 * Palettes: one dialog, two sections, a palette for light and one for dark.
 *
 * Every pick applies the instant it is made, so the app BEHIND the solid dialog
 * repaints while the person browses — the surface is the control panel and the
 * window is the preview. That is also why there is no Save and no Cancel: the
 * pick is already written (every row of Settings is instant), and the X is the
 * one control the dialog needs.
 *
 * The section whose mode is not on screen says so in a line of its own instead
 * of dimming: picking a dark palette in light mode is a valid choice, it just
 * shows later.
 */

interface PalettesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pref: ThemePreference;
  /** The mode ON SCREEN, which is what `system` makes ambiguous (see `theme-model`). */
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
      {/* `sm:max-w-[min(42rem,…)]` keeps the frame's phone gutter standing at a
          cap above the `sm` edge (DESIGN.md §3.8, `dialog-frame.ts`); the tiles
          of one mode fit a single row inside it. */}
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

/** One mode's heading, its optional "shows when…" line, and its tiles. */
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
  // The heading NAMES the group, so assistive tech reads the words on screen
  // rather than a second copy of them in an aria-label.
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
