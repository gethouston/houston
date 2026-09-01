/**
 * The search-result RENDERER for `integration_search`, split out of
 * integrations.ts and budgeted hard. Rendering used to inline every match's
 * FULL input schema untruncated: one MCP server with ~100 verbose tools (the
 * Croma incident) produced a 67 KB result that blew the model backend's
 * tool-result ceiling — the result spilled to a file, the turn burned tokens
 * re-reading it, and the model lost the thread. A search result exists to let
 * the model PICK an action; it must stay a few KB, never a schema dump.
 */

/**
 * The app-level status the host reports per search result (mirrors the host's
 * IntegrationAppStatus). It, not the raw `connected` boolean, drives which of
 * four speech acts the model performs — so a real-but-unconnected app is
 * offered for connection, an admin-blocked app sends the user to their admin,
 * and only a genuinely empty result means "no such app".
 */
export type AppStatus = "connected" | "connectable" | "blocked" | "unknown";

export interface ToolMatch {
  /** Empty ("") marks a toolkit-level entry: the app itself, no runnable action. */
  action: string;
  toolkit: string;
  description: string;
  inputParams?: unknown;
  /** Host-reported: does the user have this action's app connected? */
  connected?: boolean;
  /** Host-reported app status; absent only from an older host (derive it). */
  status?: AppStatus;
  /** Host-reported: the user's connected accounts for this app, present only
   *  when there is MORE than one — the model targets one via execute's
   *  `account`, or asks the user which to use. */
  accounts?: { id: string; label?: string }[];
}

/** Prefer the explicit status; fall back to the legacy connected boolean. */
export function statusOf(m: ToolMatch): AppStatus {
  if (m.status) return m.status;
  return m.connected === false ? "connectable" : "connected";
}

/** The per-status tag shown after an app/action name in the rendered list. */
const STATUS_TAG: Record<AppStatus, string> = {
  connected: "",
  connectable: ", NOT CONNECTED",
  blocked: ", TURNED OFF",
  unknown: ", not a known app",
};

/** Rows past this cap are counted, not rendered — the model narrows instead. */
const MAX_ITEMS = 30;
/** How many leading action matches carry their FULL input schema. The top of
 *  the list is the ranked best fit, where full parameter detail pays off. */
const FULL_SCHEMA_ITEMS = 6;
/** A single schema larger than this renders as a signature even in the full
 *  tier — one pathological tool must not eat the whole result budget. */
const MAX_SCHEMA_CHARS = 2_000;
/** Descriptions clip here: enough to pick an action, never a docs page. */
const MAX_DESCRIPTION_CHARS = 200;

const clip = (text: string, max: number): string =>
  text.length <= max ? text : `${text.slice(0, max - 1)}…`;

/**
 * A one-line signature of a JSON-schema object — `{ name: string, page?:
 * integer }` — for matches past the full-schema tier. Usually enough to run
 * the action; the note appended by {@link renderSearchItems} tells the model
 * how to get the full schema when it is not. `null` when the value is not a
 * recognizable object schema (then nothing renders — better absent than a
 * misleading partial).
 */
export function schemaSignature(schema: unknown): string | null {
  if (schema === null || typeof schema !== "object") return null;
  const { properties, required } = schema as {
    properties?: unknown;
    required?: unknown;
  };
  if (properties === null || typeof properties !== "object") return null;
  const requiredSet = new Set(
    Array.isArray(required)
      ? required.filter((r) => typeof r === "string")
      : [],
  );
  const parts = Object.entries(properties as Record<string, unknown>).map(
    ([name, spec]) => {
      const type =
        spec !== null &&
        typeof spec === "object" &&
        typeof (spec as { type?: unknown }).type === "string"
          ? (spec as { type: string }).type
          : "any";
      return `${name}${requiredSet.has(name) ? "" : "?"}: ${type}`;
    },
  );
  return `{ ${parts.join(", ")} }`;
}

/**
 * Render the ranked matches under the budgets above: full schemas for the top
 * {@link FULL_SCHEMA_ITEMS} action rows, signatures beyond that, at most
 * {@link MAX_ITEMS} rows with a count of the rest, and clipped descriptions —
 * plus the recovery notes that teach the model how to get what was elided.
 */
export function renderSearchItems(items: ToolMatch[]): string {
  const shown = items.slice(0, MAX_ITEMS);
  let fullLeft = FULL_SCHEMA_ITEMS;
  let signatures = false;
  const lines = shown.map((m) => {
    const tag = STATUS_TAG[statusOf(m)];
    const description = clip(m.description, MAX_DESCRIPTION_CHARS);
    if (m.action === "") {
      // A toolkit-level entry: the app itself, so the model learns the slug.
      return `- ${m.toolkit} (app${tag}): ${description}`;
    }
    let schema = "";
    if (m.inputParams !== undefined) {
      const full = JSON.stringify(m.inputParams);
      if (fullLeft > 0 && full.length <= MAX_SCHEMA_CHARS) {
        fullLeft -= 1;
        schema = `\n  params: ${full}`;
      } else {
        const signature = schemaSignature(m.inputParams);
        if (signature) {
          signatures = true;
          schema = `\n  params: ${signature}`;
        }
      }
    }
    return `- ${m.action} (${m.toolkit}${tag}): ${description}${schema}`;
  });
  if (items.length > shown.length) {
    lines.push(
      `(+${items.length - shown.length} more matched but are not shown - narrow the query, or set \`app\` to the one you need.)`,
    );
  }
  if (signatures) {
    lines.push(
      "(Some actions show a short params signature instead of the full schema. The listed parameters are usually enough to run them; if a run fails on parameters, search again with `app` set to that action's app and a narrower query to get its full schema.)",
    );
  }
  return lines.join("\n");
}
