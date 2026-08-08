/**
 * Where on the web is the artifact an integration action touched? Resolution
 * for the turn-end "Updates made" rows (PRODUCT-1196): first mine the action's
 * result payload for an artifact-like URL, then fall back to synthesizing the
 * canonical URL for well-known apps from the ids the action carried. Pure and
 * DOM-free so the app's node:test suite covers it directly.
 */

// Keys that never point at the artifact itself, even though they end in
// url/link (brand art, signed API downloads). Compared against the key
// lowercased with separators stripped.
const IGNORED_KEY = /(avatar|icon|image|photo|thumbnail|logo|download|upload)/;
// Keys that near-certainly ARE the artifact's canonical web location.
const PREFERRED_KEY =
  /(webviewlink|htmllink|htmlurl|permalink|publicurl|spreadsheeturl|weburl|browserurl|shareurl|pageurl|eventurl|issueurl)/;
// Hosts that are API surfaces, not something a person opens.
const API_HOST = /^https?:\/\/(api\.|[^/]*googleapis\.com)/i;

function scoreKey(rawKey: string, value: string): number {
  const key = rawKey.toLowerCase().replace(/[_-]/g, "");
  if (IGNORED_KEY.test(key) || API_HOST.test(value)) return 0;
  if (PREFERRED_KEY.test(key)) return 2;
  if (/(url|link)$/.test(key)) return 1;
  return 0;
}

/**
 * The most artifact-like `https` URL in an `integration_execute` result
 * payload, or undefined. Walks the parsed JSON breadth-first (shallow fields
 * outrank buried ones) scoring key names; when the payload does not parse —
 * the runtime truncates oversized results mid-document — falls back to a
 * key/value regex over the raw text.
 */
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
    // Truncated or non-JSON payload: scan the raw text for `"key": "https..."`
    // pairs instead — same scoring, no structure.
    const pair = /"([^"\\]{1,64})"\s*:\s*"(https?:\/\/[^"\\]+)"/g;
    for (let m = pair.exec(content); m !== null; m = pair.exec(content)) {
      consider(m[1], m[2]);
    }
  }
  return best?.url;
}

/** A record view of an unknown value; non-objects flatten to empty. */
export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * Well-known artifacts whose canonical URL is derivable from ids the action
 * already carries, for results that name no URL at all (Gmail's send returns
 * only message ids; Sheets edits return the spreadsheet id).
 */
export function synthesizedUrl(
  action: string,
  params: Record<string, unknown>,
  data: Record<string, unknown>,
): string | undefined {
  // Composio nests some payloads one level down (`data.response_data`).
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
