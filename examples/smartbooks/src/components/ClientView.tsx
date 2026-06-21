import { useCallback, useEffect, useRef, useState } from "react";
import { topics } from "@houston-ai/engine-client";
import type { ProjectFile } from "@houston-ai/engine-client";
import type { Client, Workbook } from "../lib/clients";
import {
  buildProcessPrompt,
  listStatements,
  loadWorkbook,
  openFileOnHost,
  statementsFolder,
  uploadStatement,
  workbookPath,
  workpaperXlsxPath,
} from "../lib/clients";
import type { AgentConfig } from "../lib/config";
import { getClient, getWs } from "../lib/engine";
import type { HoustonEvent } from "../lib/feed";
import { Workpaper } from "./Workpaper";

interface Props {
  client: Client;
  agent: AgentConfig;
  /** Fire a programmatic prompt through the chat session. */
  onRunPrompt: (prompt: string) => void;
  /** Open the Customize (chat) panel. Used by "Ask to change" on the workpaper card. */
  onOpenCustomize: () => void;
  busy: boolean;
}

export function ClientView({
  client,
  agent,
  onRunPrompt,
  onOpenCustomize,
  busy,
}: Props) {
  const [statements, setStatements] = useState<ProjectFile[]>([]);
  const [workbook, setWorkbook] = useState<Workbook | null>(null);
  const [workpaperFile, setWorkpaperFile] = useState<ProjectFile | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const refreshWorkbook = useCallback(async () => {
    const w = await loadWorkbook(agent.agentPath, client.slug);
    setWorkbook(w);
  }, [agent.agentPath, client.slug]);

  const refreshStatements = useCallback(async () => {
    const all = await getClient().listProjectFiles(agent.agentPath);
    setStatements(listStatements(all, client.slug));
    // Find the workpaper.xlsx entry (if it exists yet) — listProjectFiles
    // returns every non-hidden file under the agent, so we filter by path.
    const xlsxPath = workpaperXlsxPath(client.slug);
    const xlsx = all.find((f) => !f.is_directory && f.path === xlsxPath);
    setWorkpaperFile(xlsx ?? null);
  }, [agent.agentPath, client.slug]);

  // Initial load — statements list + workbook.
  useEffect(() => {
    void refreshStatements();
    void refreshWorkbook();
  }, [refreshStatements, refreshWorkbook]);

  // Live updates — the agent writes workbook.csv, the file watcher
  // emits FilesChanged, we refetch + re-render the table.
  useEffect(() => {
    const ws = getWs();
    ws.subscribe([topics.agent(agent.agentPath)]);
    const off = ws.onEvent((raw) => {
      const ev = raw as HoustonEvent;
      if (ev.type !== "FilesChanged") return;
      const data = ev.data as { agent_path: string };
      if (data.agent_path !== agent.agentPath) return;
      void refreshStatements();
      void refreshWorkbook();
    });
    return off;
  }, [agent.agentPath, refreshStatements, refreshWorkbook]);

  const processStatement = useCallback(
    (statementPath: string) => {
      onRunPrompt(buildProcessPrompt(client, statementPath));
    },
    [client, onRunPrompt],
  );

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const f of Array.from(files)) {
        const uploaded = await uploadStatement(agent.agentPath, client.slug, f);
        // Auto-fire the processing session the moment upload lands.
        // The statement's `path` from the engine is relative to the
        // agent root — we pass it straight to Claude.
        processStatement(uploaded.path);
      }
      await refreshStatements();
    } finally {
      setUploading(false);
    }
  }

  async function downloadCsv() {
    try {
      const content = await getClient().readProjectFile(
        agent.agentPath,
        workbookPath(client.slug),
      );
      const blob = new Blob([content], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${client.slug}-workbook.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.warn("csv download failed", err);
    }
  }

  async function openXlsx() {
    try {
      await openFileOnHost(agent.agentPath, workpaperXlsxPath(client.slug));
    } catch (err) {
      console.warn("open xlsx failed", err);
      alert(
        `Couldn't open the workpaper.\n\nThe file lives at:\n${agent.agentPath}/${workpaperXlsxPath(client.slug)}`,
      );
    }
  }

  const hasData = !!workbook && workbook.rows.length > 0;
  const hasStatements = statements.length > 0;

  return (
    <div className="client-view">
      <header className="client-view__header">
        <div>
          <h1 className="client-view__title">{client.name}</h1>
          <p className="muted">
            {hasData
              ? `${workbook.rows.length} transaction${workbook.rows.length === 1 ? "" : "s"} · ${statements.length} statement${statements.length === 1 ? "" : "s"}`
              : `Folder · `}
            {!hasData && <code>clients/{client.slug}/</code>}
          </p>
        </div>

        <div className="client-view__header-actions">
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            multiple
            hidden
            onChange={(e) => {
              void handleFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <button
            className="btn btn--primary"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? "Uploading…" : "+ Upload statement"}
          </button>
        </div>
      </header>

      <div
        className={`canvas${dragging ? " canvas--dragging" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(e) => {
          // Only unset if leaving the canvas entirely.
          if (e.currentTarget.contains(e.relatedTarget as Node)) return;
          setDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void handleFiles(e.dataTransfer.files);
        }}
      >
        {!hasStatements && !busy ? (
          <EmptyCanvas />
        ) : !hasData ? (
          busy ? (
            <WorkingState count={statements.length} />
          ) : (
            <ProcessingPrompt
              statement={statements[statements.length - 1]}
              onProcess={processStatement}
            />
          )
        ) : (
          <Workpaper
            workbook={workbook!}
            statements={statements}
            workpaperFile={workpaperFile}
            agentPath={agent.agentPath}
            onDownloadCsv={downloadCsv}
            onOpenXlsx={openXlsx}
            onAskCustomize={onOpenCustomize}
          />
        )}

        {dragging && (
          <div className="canvas__drop-overlay">
            <span>Drop to upload statement</span>
          </div>
        )}
      </div>

      {hasData && busy && (
        <div className="canvas__footer muted">
          <span className="typing">
            <span />
            <span />
            <span />
          </span>
          <span>Working on the newest statement…</span>
        </div>
      )}
    </div>
  );
}

function EmptyCanvas() {
  return (
    <div className="canvas__empty">
      <div className="canvas__empty-icon" aria-hidden>
        ⇪
      </div>
      <h2>Drop a bank statement</h2>
      <p className="muted">
        PDFs only. SmartBooks will extract every transaction and build the
        table automatically.
      </p>
    </div>
  );
}

function WorkingState({ count }: { count: number }) {
  return (
    <div className="canvas__working">
      <div className="canvas__spinner" />
      <h2>Reading your statement{count > 1 ? "s" : ""}…</h2>
      <p className="muted">
        Your bookkeeper is pulling every transaction. This takes a few
        seconds per page.
      </p>
    </div>
  );
}

interface ProcessingPromptProps {
  statement: ProjectFile;
  onProcess: (path: string) => void;
}

function ProcessingPrompt({ statement, onProcess }: ProcessingPromptProps) {
  // Fallback: user uploaded a statement but the auto-processing session
  // errored out or hasn't produced a workbook yet. Give them a retry.
  return (
    <div className="canvas__retry">
      <h2>Statement uploaded</h2>
      <p className="muted">
        <strong>{displayName(statement.name)}</strong> is saved but the
        table hasn't been generated. Try processing again?
      </p>
      <button
        className="btn btn--primary"
        onClick={() => onProcess(statement.path)}
      >
        Process it now
      </button>
    </div>
  );
}

/** Strip our timestamp prefix so the UI shows the clean name. */
function displayName(name: string): string {
  return name.replace(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-/, "");
}

// Re-export so tsgo is happy about the unused import when the file
// hasn't been touched. Stays a no-op at runtime.
export { statementsFolder };
