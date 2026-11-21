const IGNORED_KEY = /(avatar|icon|image|photo|thumbnail|logo|download|upload)/;
const PREFERRED_KEY =
  /(webviewlink|htmllink|htmlurl|permalink|publicurl|spreadsheeturl|weburl|browserurl|shareurl|pageurl|eventurl|issueurl)/;
const API_HOST = /^https?:\/\/(api\.|[^/]*googleapis\.com)/i;

function scoreKey(rawKey: string, value: string): number {
  const key = rawKey.toLowerCase().replace(/[_-]/g, "");
  if (IGNORED_KEY.test(key) || API_HOST.test(value)) return 0;
  if (PREFERRED_KEY.test(key)) return 2;
  if (/(url|link)$/.test(key)) return 1;
  return 0;
}

export function externalUrlOf(content: string): string | undefined {
  let best: { score: number; url: string } | undefined;
  const consider = (key: string, value: unknown) => {
    if (typeof value !== "string" || !/^https?:\/\//.test(value)) return;
    const score = scoreKey(key, value);
    if (score > 0 && (!best || score > best.score))
      best = { score, url: value };
  };
  try {
    const queue: unknown[] = [JSON.parse(content)];
    let visited = 0;
    while (queue.length > 0 && visited < 2000) {
      const node = queue.shift();
      visited++;
      if (Array.isArray(node)) {
        queue.push(...node.slice(0, 50));
      } else if (node && typeof node === "object") {
        for (const [key, value] of Object.entries(node)) {
          consider(key, value);
          if (value && typeof value === "object") queue.push(value);
        }
      }
      if (best?.score === 2) break;
    }
  } catch {
    const pair = /"([^"\\]{1,64})"\s*:\s*"(https?:\/\/[^"\\]+)"/g;
    for (let m = pair.exec(content); m !== null; m = pair.exec(content)) {
      consider(m[1], m[2]);
    }
  }
  return best?.url;
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function synthesizedUrl(
  action: string,
  params: Record<string, unknown>,
  data: Record<string, unknown>,
): string | undefined {
  const sources = [params, data, asRecord(data.response_data)];
  const id = (...keys: string[]) => {
    for (const k of keys) {
      for (const source of sources) {
        const v = source[k];
        if (typeof v === "string" && v.length > 0) return v;
      }
    }
    return undefined;
  };
  const a = action.toUpperCase();
  if (a.startsWith("GOOGLESHEETS")) {
    const sheet = id("spreadsheet_id", "spreadsheetId");
    if (sheet) return `https://docs.google.com/spreadsheets/d/${sheet}`;
  }
  if (a.startsWith("GOOGLEDOCS")) {
    const doc = id("document_id", "documentId");
    if (doc) return `https://docs.google.com/document/d/${doc}`;
  }
  if (a.startsWith("GMAIL")) {
    const message = id("thread_id", "threadId", "id");
    if (message) return `https://mail.google.com/mail/u/0/#all/${message}`;
  }
  if (a.startsWith("AIRTABLE")) {
    const base = id("base_id", "baseId");
    const table = id("table_id", "tableId", "table_id_or_name");
    if (base && table) return `https://airtable.com/${base}/${table}`;
  }
  return undefined;
}
