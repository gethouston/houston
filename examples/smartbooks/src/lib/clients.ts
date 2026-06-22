/**
 * Client CRUD backed by the agent filesystem.
 *
 * Layout per client:
 *   clients/<slug>/
 *     client.json     metadata { id, name, slug, createdAt }
 *     statements/     raw PDFs the user drops
 *     workbook.csv    the single live table SmartBooks renders
 *     rules.md        optional — agent appends per-client rules here
 *
 * The app is built around one idea: ONE csv per client, appended to
 * as the user uploads more statements. No date-stamped copies, no
 * separate "workbooks" folder. The workbook IS the app.
 */

import type { ProjectFile } from "@houston-ai/engine-client";
import { getClient } from "./engine";

export interface Client {
  id: string;
  slug: string;
  name: string;
  createdAt: string;
}

export interface Transaction {
  date: string;
  description: string;
  amount: string; // raw — the CSV is the source of truth; UI parses when it needs numbers
  category: string;
  [extra: string]: string;
}

export interface Workbook {
  columns: string[];
  rows: Transaction[];
}

const CLIENTS_ROOT = "clients";

export function slugify(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48) || "client"
  );
}

export function clientContextLine(client: Client): string {
  return `(client: ${client.name}, folder: ${clientFolder(client.slug)}/)`;
}

export function clientFolder(slug: string): string {
  return `${CLIENTS_ROOT}/${slug}`;
}

export function statementsFolder(slug: string): string {
  return `${clientFolder(slug)}/statements`;
}

export function workbookPath(slug: string): string {
  return `${clientFolder(slug)}/workbook.csv`;
}

/** List clients by scanning the top-level folders under `clients/`. */
export async function listClients(agentPath: string): Promise<Client[]> {
  const files = await getClient().listProjectFiles(agentPath);
  const clientDirs = files.filter((f) => {
    if (!f.is_directory) return false;
    if (!f.path.startsWith(`${CLIENTS_ROOT}/`)) return false;
    const rest = f.path.slice(CLIENTS_ROOT.length + 1);
    return rest.length > 0 && !rest.includes("/");
  });
  const out: Client[] = [];
  for (const dir of clientDirs) {
    try {
      const content = await getClient().readAgentFile(
        agentPath,
        `${dir.path}/client.json`,
      );
      out.push(JSON.parse(content) as Client);
    } catch {
      // Half-created client — skip.
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export async function createClient(
  agentPath: string,
  name: string,
): Promise<Client> {
  const slug = slugify(name);
  const client: Client = {
    id: crypto.randomUUID(),
    slug,
    name: name.trim(),
    createdAt: new Date().toISOString(),
  };
  await getClient().createFolder(agentPath, clientFolder(slug));
  await getClient().createFolder(agentPath, statementsFolder(slug));
  await getClient().writeAgentFile(
    agentPath,
    `${clientFolder(slug)}/client.json`,
    JSON.stringify(client, null, 2),
  );
  return client;
}

/** List statement PDFs uploaded for a client. */
export function listStatements(
  all: ProjectFile[],
  slug: string,
): ProjectFile[] {
  const prefix = `${statementsFolder(slug)}/`;
  return all
    .filter((f) => !f.is_directory && f.path.startsWith(prefix))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function uploadStatement(
  agentPath: string,
  slug: string,
  file: File,
): Promise<ProjectFile> {
  const b64 = await fileToBase64(file);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const target = `${statementsFolder(slug)}/${stamp}-${file.name}`;
  return await getClient().importFileBytes(agentPath, target, b64);
}

/** Fetch + parse the live workbook.csv. Returns null if the agent hasn't produced it yet. */
export async function loadWorkbook(
  agentPath: string,
  slug: string,
): Promise<Workbook | null> {
  try {
    const content = await getClient().readProjectFile(
      agentPath,
      workbookPath(slug),
    );
    return parseCsv(content);
  } catch {
    return null;
  }
}

/** Build the prompt that processes a newly-uploaded statement into the workbook. */
export function buildProcessPrompt(
  client: Client,
  statementPath: string,
): string {
  // Strip the timestamp prefix the UI adds on upload so the `source`
  // column reflects the original filename the user recognizes.
  const fileName = statementPath.split("/").pop() ?? statementPath;
  const sourceName = fileName.replace(
    /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-/,
    "",
  );
  return `${clientContextLine(client)}
Process ${statementPath}. Write the full table to ${workbookPath(client.slug)} AND regenerate the Excel workpaper at ${workpaperXlsxPath(client.slug)}. Every row must include \`source: "${sourceName}"\`. If workbook.csv already exists, append new rows (dedup by date+description+amount). Reply in one sentence.`;
}

export function workpaperXlsxPath(slug: string): string {
  return `${clientFolder(slug)}/workpaper.xlsx`;
}

/** Tiny RFC-4180-ish parser. Handles quoted fields + embedded commas + escaped quotes. */
export function parseCsv(text: string): Workbook {
  const lines = splitCsvLines(text.trim());
  if (lines.length === 0) return { columns: [], rows: [] };
  const columns = lines[0];
  const rows: Transaction[] = lines.slice(1).map((cells) => {
    const row: Transaction = {
      date: "",
      description: "",
      amount: "",
      category: "",
    };
    columns.forEach((col, i) => {
      row[col] = cells[i] ?? "";
    });
    return row;
  });
  return { columns, rows };
}

function splitCsvLines(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      out.push(row);
      row = [];
      cell = "";
    } else {
      cell += c;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    out.push(row);
  }
  return out.filter((r) => r.length > 1 || (r.length === 1 && r[0].length > 0));
}

/**
 * Open a file on the host machine using its default application.
 *
 * The engine runs locally (or next to the agent's filesystem), so we
 * can shell-execute `open <path>` via /v1/shell. macOS's `open` picks
 * the default app (Excel, Numbers, Preview, etc.) based on extension.
 *
 * Cross-platform nuance: this uses `open` which is macOS-only.
 * Linux would need `xdg-open`, Windows `start`. For this example
 * (local demo, Mac user) that's fine.
 */
export async function openFileOnHost(
  agentPath: string,
  relPath: string,
): Promise<void> {
  const fullPath = `${agentPath}/${relPath}`;
  // Single-quote the path so spaces + parens don't break the shell.
  // If the path contains a single quote itself, escape it as '\''.
  const quoted = `'${fullPath.replace(/'/g, `'\\''`)}'`;
  await getClient().runShell({
    path: agentPath,
    command: `open ${quoted}`,
  });
}

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(
      null,
      bytes.subarray(i, i + CHUNK) as unknown as number[],
    );
  }
  return btoa(binary);
}
