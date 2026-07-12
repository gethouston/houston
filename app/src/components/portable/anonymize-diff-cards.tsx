/**
 * Before/after diff cards for the anonymize review. Each card shows the
 * original and redacted text side by side with a keep/skip toggle so the user
 * decides, per item, whether the redaction ships.
 */

import { cn } from "@houston-ai/core";
import { useTranslation } from "react-i18next";

export function DiffCard({
  title,
  before,
  after,
  summary,
  becameEmpty,
  accepted,
  onToggle,
}: {
  title: string;
  before: string;
  after: string;
  summary: string;
  becameEmpty: boolean;
  accepted: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation("portable");
  return (
    <article className="rounded-xl border border-foreground/5 bg-background p-4">
      <header className="flex items-center justify-between gap-3 mb-3">
        <p className="text-sm font-medium">{title}</p>
        <button
          type="button"
          onClick={onToggle}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          {accepted ? t("export.step2.keep") : t("export.step2.skip")}
        </button>
      </header>
      <div className="grid grid-cols-2 gap-3">
        <Pane
          label={t("export.step2.before")}
          body={before}
          dimmed={accepted}
        />
        <Pane label={t("export.step2.after")} body={after} dimmed={!accepted} />
      </div>
      <p className="text-xs text-muted-foreground mt-3">{summary}</p>
      {becameEmpty && (
        <p className="text-xs text-muted-foreground mt-1">
          {t("export.step2.becameEmpty")}
        </p>
      )}
    </article>
  );
}

export function RoutineDiffCard({
  routineId,
  fieldDiffs,
  accepted,
  onToggle,
}: {
  routineId: string;
  fieldDiffs: { field: string; before: string; after: string }[];
  accepted: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation("portable");
  return (
    <article className="rounded-xl border border-foreground/5 bg-background p-4">
      <header className="flex items-center justify-between gap-3 mb-3">
        <p className="text-sm font-medium">
          {t("export.step2.routineTitle", { id: routineId })}
        </p>
        <button
          type="button"
          onClick={onToggle}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          {accepted ? t("export.step2.keep") : t("export.step2.skip")}
        </button>
      </header>
      <div className="space-y-3">
        {fieldDiffs.map((d) => (
          <div key={d.field} className="grid grid-cols-2 gap-3">
            <Pane
              label={`${d.field} · ${t("export.step2.before")}`}
              body={d.before}
              dimmed={accepted}
            />
            <Pane
              label={`${d.field} · ${t("export.step2.after")}`}
              body={d.after}
              dimmed={!accepted}
            />
          </div>
        ))}
      </div>
    </article>
  );
}

function Pane({
  label,
  body,
  dimmed,
}: {
  label: string;
  body: string;
  dimmed: boolean;
}) {
  return (
    <div className={cn("rounded-lg bg-secondary p-3", dimmed && "opacity-40")}>
      <p className="text-[11px] text-muted-foreground mb-1.5">{label}</p>
      <pre className="text-xs whitespace-pre-wrap break-words font-sans line-clamp-6">
        {body}
      </pre>
    </div>
  );
}
