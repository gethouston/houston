import type { ProjectFile } from "@houston-ai/engine-client";
import { useMemo, useState } from "react";
import type { Transaction, Workbook } from "../lib/clients";
import { TransactionsTable } from "./TransactionsTable";

interface Props {
  workbook: Workbook;
  statements: ProjectFile[];
  /** `ProjectFile` for the workpaper.xlsx if it exists — powers the card. */
  workpaperFile: ProjectFile | null;
  /** Absolute agent folder — shown in the Source documents tab. */
  agentPath: string;
  onDownloadCsv: () => void;
  onOpenXlsx: () => void;
  onAskCustomize: () => void;
}

type Tab = "transactions" | "summary" | "files";

/**
 * Three panels under the workpaper card:
 *
 *  - Transactions — the full flat table (per-statement breakdowns live
 *    inside the xlsx's sheets, NOT as frontend tabs)
 *  - Summary      — totals by category, basic aggregates
 *  - Source documents — every uploaded PDF
 *
 * The xlsx is the deliverable; the frontend panels are for in-app
 * exploration of the underlying data.
 */
export function Workpaper({
  workbook,
  statements,
  workpaperFile,
  agentPath,
  onDownloadCsv,
  onOpenXlsx,
  onAskCustomize,
}: Props) {
  const [active, setActive] = useState<Tab>("transactions");

  const sheetCount = useMemo(() => {
    // 2 fixed sheets (Summary + Transactions) + one per distinct source.
    const sources = new Set<string>();
    for (const row of workbook.rows) if (row.source) sources.add(row.source);
    return 2 + sources.size;
  }, [workbook.rows]);

  return (
    <div className="workpaper">
      <WorkpaperCard
        file={workpaperFile}
        sheetCount={sheetCount}
        onOpen={onOpenXlsx}
        onAskCustomize={onAskCustomize}
      />

      <div className="workpaper__tabs" role="tablist">
        <TabButton
          active={active === "transactions"}
          onClick={() => setActive("transactions")}
        >
          Transactions
          <span className="workpaper__count">{workbook.rows.length}</span>
        </TabButton>
        <TabButton
          active={active === "summary"}
          onClick={() => setActive("summary")}
        >
          Summary
        </TabButton>
        <span className="workpaper__spacer" />
        <TabButton
          active={active === "files"}
          onClick={() => setActive("files")}
        >
          Source documents
          <span className="workpaper__count">{statements.length}</span>
        </TabButton>
      </div>

      <div className="workpaper__pane">
        {active === "transactions" ? (
          <TransactionsTable workbook={workbook} onDownload={onDownloadCsv} />
        ) : active === "summary" ? (
          <SummaryTab rows={workbook.rows} />
        ) : (
          <FilesTab statements={statements} agentPath={agentPath} />
        )}
      </div>
    </div>
  );
}

interface CardProps {
  file: ProjectFile | null;
  sheetCount: number;
  onOpen: () => void;
  onAskCustomize: () => void;
}

function WorkpaperCard({
  file,
  sheetCount,
  onOpen,
  onAskCustomize,
}: CardProps) {
  if (!file) {
    return (
      <div className="wp-card wp-card--pending">
        <div className="wp-card__icon" aria-hidden>
          📊
        </div>
        <div className="wp-card__body">
          <div className="wp-card__title">Workpaper</div>
          <div className="wp-card__subtitle muted">
            The Excel workpaper will appear here once your first statement is
            processed. It bundles a Summary sheet, a full Transactions sheet,
            and one sheet per statement.
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="wp-card">
      <div className="wp-card__icon" aria-hidden>
        📊
      </div>
      <div className="wp-card__body">
        <div className="wp-card__title">workpaper.xlsx</div>
        <div className="wp-card__subtitle muted">
          <span>
            {sheetCount} sheet{sheetCount === 1 ? "" : "s"}
          </span>
          <span className="wp-card__dot">·</span>
          <span>{formatSize(file.size)}</span>
          <span className="wp-card__dot">·</span>
          <span>
            Open in Excel or Numbers to see the Summary + per-statement
            breakdown
          </span>
        </div>
      </div>
      <div className="wp-card__actions">
        <button
          type="button"
          className="btn btn--ghost btn--small"
          onClick={onAskCustomize}
        >
          ✎ Ask to change
        </button>
        <button
          type="button"
          className="btn btn--primary btn--small"
          onClick={onOpen}
        >
          ↗ Open in Excel
        </button>
      </div>
    </div>
  );
}

interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

function TabButton({ active, onClick, children }: TabButtonProps) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={`workpaper__tab${active ? " workpaper__tab--active" : ""}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

interface SummaryProps {
  rows: Transaction[];
}

interface CategoryTotal {
  category: string;
  count: number;
  inflow: number;
  outflow: number;
  net: number;
}

function SummaryTab({ rows }: SummaryProps) {
  const { byCategory, totalIn, totalOut } = useMemo(() => {
    const bucket = new Map<string, CategoryTotal>();
    let totalIn = 0;
    let totalOut = 0;
    for (const row of rows) {
      const amount = parseFloat(row.amount);
      if (Number.isNaN(amount)) continue;
      const cat = row.category || "Uncategorized";
      const existing = bucket.get(cat) ?? {
        category: cat,
        count: 0,
        inflow: 0,
        outflow: 0,
        net: 0,
      };
      existing.count += 1;
      if (amount >= 0) {
        existing.inflow += amount;
        totalIn += amount;
      } else {
        existing.outflow += amount;
        totalOut += amount;
      }
      existing.net += amount;
      bucket.set(cat, existing);
    }
    return {
      byCategory: Array.from(bucket.values()).sort(
        (a, b) => Math.abs(b.net) - Math.abs(a.net),
      ),
      totalIn,
      totalOut,
    };
  }, [rows]);

  if (rows.length === 0) {
    return (
      <div className="table-empty muted">
        <p>No transactions yet.</p>
      </div>
    );
  }

  const net = totalIn + totalOut;

  return (
    <div className="summary">
      <div className="summary__kpis">
        <Kpi label="Money in" value={totalIn} kind="pos" />
        <Kpi label="Money out" value={totalOut} kind="neg" />
        <Kpi label="Net" value={net} kind={net < 0 ? "neg" : "pos"} />
        <Kpi label="Transactions" value={rows.length} kind="plain" />
      </div>

      <div className="table-scroll">
        <table className="tx-table">
          <thead>
            <tr>
              <th>Category</th>
              <th>Count</th>
              <th>In</th>
              <th>Out</th>
              <th>Net</th>
            </tr>
          </thead>
          <tbody>
            {byCategory.map((c) => (
              <tr key={c.category}>
                <td className="cell-category">{c.category}</td>
                <td>{c.count}</td>
                <td className="amount-pos">
                  {c.inflow ? formatMoney(c.inflow) : "—"}
                </td>
                <td className="amount-neg">
                  {c.outflow ? formatMoney(c.outflow) : "—"}
                </td>
                <td className={c.net < 0 ? "amount-neg" : "amount-pos"}>
                  {formatMoney(c.net)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface KpiProps {
  label: string;
  value: number;
  kind: "pos" | "neg" | "plain";
}

function Kpi({ label, value, kind }: KpiProps) {
  const cls =
    kind === "pos" ? "amount-pos" : kind === "neg" ? "amount-neg" : "";
  return (
    <div className="kpi">
      <span className="kpi__label muted">{label}</span>
      <span className={`kpi__value ${cls}`}>
        {kind === "plain" ? value : formatMoney(value)}
      </span>
    </div>
  );
}

interface FilesProps {
  statements: ProjectFile[];
  agentPath: string;
}

function FilesTab({ statements, agentPath }: FilesProps) {
  if (statements.length === 0) {
    return (
      <div className="table-empty muted">
        <p>No statements uploaded yet. Drop PDFs onto the workspace.</p>
      </div>
    );
  }
  return (
    <div className="files-list">
      <p className="files-list__hint muted">
        Originals live in <code>{agentPath}</code>.
      </p>
      <ul>
        {statements.map((f) => {
          const name = displayName(f.name);
          const uploaded = extractUploadDate(f.name);
          return (
            <li key={f.path} className="file-card">
              <div className="file-card__icon">📄</div>
              <div className="file-card__body">
                <div className="file-card__name">{name}</div>
                <div className="file-card__meta muted">
                  {uploaded && <span>Uploaded {uploaded}</span>}
                  <span>· {formatSize(f.size)}</span>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ---------- helpers ----------

function displayName(name: string): string {
  return name.replace(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-/, "");
}

function extractUploadDate(name: string): string | null {
  const m = name.match(/^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-/);
  if (!m) return null;
  const [, date, hh, mm] = m;
  return `${date} at ${hh}:${mm}`;
}

function formatMoney(n: number): string {
  const abs = Math.abs(n).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return n < 0 ? `-$${abs}` : `$${abs}`;
}

function formatSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
