import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import { shortcutLabel } from "../lib/shortcuts";
import { useUIStore } from "../stores/ui";

interface Row {
  /** Either a single action (label = its glyph) or an array of glyphs
   *  rendered together (e.g. all four arrow keys for board nav). */
  glyphs: string;
  labelKey: string;
}

const NAV_ROWS: Row[] = [
  {
    glyphs: shortcutLabel("palette"),
    labelKey: "shell:cheatsheet.rows.palette",
  },
  {
    glyphs: shortcutLabel("missionControl"),
    labelKey: "shell:cheatsheet.rows.missionControl",
  },
  {
    glyphs: shortcutLabel("newMission"),
    labelKey: "shell:cheatsheet.rows.newMission",
  },
];

const CYCLE_ROWS: Row[] = [
  {
    glyphs: shortcutLabel("prevAgent"),
    labelKey: "shell:cheatsheet.rows.prevAgent",
  },
  {
    glyphs: shortcutLabel("nextAgent"),
    labelKey: "shell:cheatsheet.rows.nextAgent",
  },
  {
    glyphs: `${shortcutLabel("boardUp")} ${shortcutLabel("boardDown")} ${shortcutLabel("boardLeft")} ${shortcutLabel("boardRight")}`,
    labelKey: "shell:cheatsheet.rows.boardNavigate",
  },
  {
    glyphs: shortcutLabel("boardOpen"),
    labelKey: "shell:cheatsheet.rows.boardOpen",
  },
  { glyphs: "Esc", labelKey: "shell:cheatsheet.rows.panelEscape" },
];

const HELP_ROWS: Row[] = [
  {
    glyphs: shortcutLabel("cheatsheet"),
    labelKey: "shell:cheatsheet.rows.cheatsheet",
  },
];

function Section({
  title,
  rows,
  t,
}: {
  title: string;
  rows: Row[];
  t: (k: string) => string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </div>
      <div className="flex flex-col">
        {rows.map((r) => (
          <div
            key={r.labelKey}
            className="flex items-center justify-between rounded-md py-2"
          >
            <span className="text-sm text-foreground">{t(r.labelKey)}</span>
            <kbd className="rounded-md border border-border bg-secondary px-2 py-0.5 font-mono text-xs text-foreground">
              {r.glyphs}
            </kbd>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ShortcutCheatsheet() {
  const { t } = useTranslation("shell");
  const open = useUIStore((s) => s.cheatsheetOpen);
  const setOpen = useUIStore((s) => s.setCheatsheetOpen);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("cheatsheet.title")}</DialogTitle>
          <DialogDescription>{t("cheatsheet.description")}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-5 pt-2">
          <Section
            title={t("cheatsheet.sections.navigation")}
            rows={NAV_ROWS}
            t={t}
          />
          <Section
            title={t("cheatsheet.sections.cycle")}
            rows={CYCLE_ROWS}
            t={t}
          />
          <Section
            title={t("cheatsheet.sections.help")}
            rows={HELP_ROWS}
            t={t}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
