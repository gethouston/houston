import type { ReactNode } from "react";
import { SwitchRow } from "./wizard-parts";

/**
 * One "keep or leave behind" screen: a title, a sentence, select-all / clear,
 * and a switch per item. Shared by the import wizard ("From a friend") and the
 * create dialog's "Copy an agent" path, so both read as the same product.
 */

export interface PickListLabels {
  selectAll: string;
  clearAll: string;
  /** Shown under a row the threat scan flagged. */
  flagged: string;
}

export interface PickListStepProps<T> {
  title: string;
  body: string;
  items: T[];
  selected: Set<string>;
  setSelected: (s: Set<string>) => void;
  getId: (item: T) => string;
  renderRow: (item: T) => {
    title: string;
    subtitle?: string;
    trailing?: ReactNode;
    flagged?: boolean;
  };
  labels: PickListLabels;
  /** Render as a section inside another screen (smaller heading), not a screen. */
  compact?: boolean;
}

export function PickListStep<T>({
  title,
  body,
  items,
  selected,
  setSelected,
  getId,
  renderRow,
  labels,
  compact,
}: PickListStepProps<T>) {
  const toggle = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  return (
    <div className={compact ? "space-y-3" : "space-y-10"}>
      {compact ? (
        <header>
          <h2 className="text-sm font-medium">{title}</h2>
          <p className="mt-1 text-xs text-ink-muted">{body}</p>
        </header>
      ) : (
        <header>
          <h1 className="text-2xl font-normal leading-tight text-balance">
            {title}
          </h1>
          <p className="mt-3 text-base text-ink-muted">{body}</p>
        </header>
      )}

      <div>
        <div className="mb-2 flex justify-end gap-4 text-xs text-ink-muted">
          <button
            type="button"
            onClick={() => setSelected(new Set(items.map(getId)))}
            className="hover:text-ink"
          >
            {labels.selectAll}
          </button>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="hover:text-ink"
          >
            {labels.clearAll}
          </button>
        </div>
        <div className="space-y-1">
          {items.map((item) => {
            const id = getId(item);
            const row = renderRow(item);
            return (
              <SwitchRow
                key={id}
                checked={selected.has(id)}
                onChange={() => toggle(id)}
                title={row.title}
                subtitle={row.subtitle}
                trailing={row.trailing}
                flaggedNote={row.flagged ? labels.flagged : null}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
