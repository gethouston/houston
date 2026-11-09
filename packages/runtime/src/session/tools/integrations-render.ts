import { clipSchemaText as clip, schemaSignature } from "./integrations-schema";
import { parameterDetails } from "./integrations-schema-details";
import { parameterLookupInstruction } from "./integrations-search-notes";

export { schemaSignature } from "./integrations-schema";

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
  accounts?: { id: string; label?: string; createdAt?: string }[];
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
// Backends keep a long result's first 8K characters; detailed rows crowd later rows out.
const DETAILED_ITEMS = 2;
const MAX_DETAILED_CHARS = 3_300;
const MAX_DESCRIPTION_CHARS = 200;

/** Bound ranked results while keeping parameter details on the best matches. */
export function renderSearchItems(items: ToolMatch[]): string {
  const shown = items.slice(0, MAX_ITEMS);
  let actionsSeen = 0;
  let signatures = false;
  const lines = shown.map((m) => {
    const tag = STATUS_TAG[statusOf(m)];
    const description = clip(m.description, MAX_DESCRIPTION_CHARS);
    if (m.action === "") {
      // A toolkit-level entry: the app itself, so the model learns the slug.
      return `- ${m.toolkit} (app${tag}): ${description}`;
    }
    const header = `- ${m.action} (${m.toolkit}${tag}): ${description}`;
    if (m.inputParams === undefined) return header;
    const detailed = actionsSeen++ < DETAILED_ITEMS;
    if (detailed) {
      try {
        const full = JSON.stringify(m.inputParams);
        if (full.length <= 2000) return `${header}\n  params: ${full}`;
      } catch (error) {
        // Deep schemas can exceed the serializer's stack before the row budget.
        if (!(error instanceof RangeError)) throw error;
      }
    }
    const signature = schemaSignature(m.inputParams);
    if (!signature) return header;
    const summary = `${header}\n  params: ${signature}`;
    signatures = true;
    return detailed
      ? summary +
          parameterDetails(m.inputParams, MAX_DETAILED_CHARS - summary.length)
      : summary;
  });
  // Notes lead: both backends keep only a long result's first 8k characters.
  const notes: string[] = [];
  if (items.length > shown.length) {
    notes.push(
      `(+${items.length - shown.length} more matched but are not shown - narrow the query, or set \`app\` to the one you need.)`,
    );
  }
  if (signatures) {
    notes.push(
      `(Some actions show only a params signature. ${parameterLookupInstruction()})`,
    );
  }
  return [...notes, ...lines].join("\n");
}
