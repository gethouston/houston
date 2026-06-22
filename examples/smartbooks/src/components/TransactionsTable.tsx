import { useMemo } from "react";
import type { Workbook } from "../lib/clients";

interface Props {
  workbook: Workbook;
  onDownload: () => void;
}

/**
 * Renders the client's live workbook as an editable-looking grid.
 *
 * Today the table is read-only — the soft-workflow loop is "user asks the
 * agent to change something, the agent edits the script, the CSV
 * re-renders." Inline cell editing would be a future layer on top.
 */
export function TransactionsTable({ workbook, onDownload }: Props) {
  const total = useMemo(() => {
    let n = 0;
    for (const row of workbook.rows) {
      const v = parseFloat(row.amount);
      if (!Number.isNaN(v)) n += v;
    }
    return n;
  }, [workbook.rows]);

  if (workbook.rows.length === 0) {
    return (
      <div className="table-empty muted">
        <p>
          Workbook exists but has no rows yet. Drop a statement to populate it.
        </p>
      </div>
    );
  }

  return (
    <div className="table-wrap">
      <div className="table-toolbar">
        <div className="table-summary">
          <strong>{workbook.rows.length}</strong>
          <span className="muted"> rows</span>
          <span className="table-summary__dot">·</span>
          <strong className={total < 0 ? "amount-neg" : "amount-pos"}>
            {formatAmount(total)}
          </strong>
          <span className="muted"> net</span>
        </div>
        <button
          type="button"
          className="btn btn--ghost btn--small"
          onClick={onDownload}
        >
          ↓ Download CSV
        </button>
      </div>

      <div className="table-scroll">
        <table className="tx-table">
          <thead>
            <tr>
              {workbook.columns.map((col) => (
                <th key={col}>{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {workbook.rows.map((row, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: Transaction has no id field; composite key risks false-uniqueness on duplicate rows; index is the safest stable key here
              <tr key={i}>
                {workbook.columns.map((col) => (
                  <td key={col} className={cellClass(col, row[col])}>
                    {col === "amount" ? formatAmount(row[col]) : row[col]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function cellClass(col: string, value: string): string {
  if (col === "amount") {
    const v = parseFloat(value);
    if (!Number.isNaN(v)) return v < 0 ? "amount-neg" : "amount-pos";
  }
  if (col === "category") return "cell-category";
  return "";
}

function formatAmount(raw: string | number): string {
  const n = typeof raw === "number" ? raw : parseFloat(raw);
  if (Number.isNaN(n)) return String(raw);
  const formatted = Math.abs(n).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return n < 0 ? `-$${formatted}` : `$${formatted}`;
}
