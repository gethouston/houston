import { useTranslation } from "react-i18next";
import { Kbd, KbdGroup } from "@houston-ai/core";
import { shortcutParts, type ShortcutAction } from "../../../lib/shortcuts";

interface Row {
  action?: ShortcutAction;
  /** Used for groups of glyphs that don't map to a single action (e.g. arrows). */
  parts?: string[][];
  labelKey: string;
}

const NAV_ROWS: Row[] = [
  { action: "palette", labelKey: "shell:cheatsheet.rows.palette" },
  { action: "missionControl", labelKey: "shell:cheatsheet.rows.missionControl" },
  { action: "newMission", labelKey: "shell:cheatsheet.rows.newMission" },
];

const CYCLE_ROWS: Row[] = [
  { action: "prevAgent", labelKey: "shell:cheatsheet.rows.prevAgent" },
  { action: "nextAgent", labelKey: "shell:cheatsheet.rows.nextAgent" },
  {
    parts: [
      shortcutParts("boardUp"),
      shortcutParts("boardDown"),
      shortcutParts("boardLeft"),
      shortcutParts("boardRight"),
    ],
    labelKey: "shell:cheatsheet.rows.boardNavigate",
  },
  { action: "boardOpen", labelKey: "shell:cheatsheet.rows.boardOpen" },
  { parts: [["Esc"]], labelKey: "shell:cheatsheet.rows.panelEscape" },
];

const HELP_ROWS: Row[] = [
  { action: "cheatsheet", labelKey: "shell:cheatsheet.rows.cheatsheet" },
];

function RowKbd({ row }: { row: Row }) {
  const groups = row.action
    ? [shortcutParts(row.action)]
    : (row.parts ?? []);
  return (
    <div className="flex items-center gap-1">
      {groups.map((parts, i) => (
        <KbdGroup key={i}>
          {parts.map((p) => (
            <Kbd key={p}>{p}</Kbd>
          ))}
        </KbdGroup>
      ))}
    </div>
  );
}

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
            <RowKbd row={r} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function ShortcutsSection() {
  const { t } = useTranslation(["settings", "shell"]);
  return (
    <section>
      <h2 className="text-lg font-semibold mb-1">
        {t("settings:shortcuts.title")}
      </h2>
      <p className="text-sm text-muted-foreground mb-6">
        {t("settings:shortcuts.description")}
      </p>
      <div className="flex flex-col gap-6">
        <Section title={t("shell:cheatsheet.sections.navigation")} rows={NAV_ROWS} t={t} />
        <Section title={t("shell:cheatsheet.sections.cycle")} rows={CYCLE_ROWS} t={t} />
        <Section title={t("shell:cheatsheet.sections.help")} rows={HELP_ROWS} t={t} />
      </div>
    </section>
  );
}
