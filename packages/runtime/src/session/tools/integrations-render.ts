import { FILE_PARAM_NOTE, presentFileParams } from "./integrations-file-params";
import { clipSchemaText as clip, schemaSignature } from "./integrations-schema";
import { parameterDetails } from "./integrations-schema-details";
import { parameterLookupInstruction } from "./integrations-search-notes";

export { schemaSignature } from "./integrations-schema";

export type AppStatus = "connected" | "connectable" | "blocked" | "unknown";

export interface ToolMatch {
  action: string;
  toolkit: string;
  description: string;
  inputParams?: unknown;
  connected?: boolean;
  status?: AppStatus;
  accounts?: { id: string; label?: string; createdAt?: string }[];
}

export function statusOf(m: ToolMatch): AppStatus {
  if (m.status) return m.status;
  return m.connected === false ? "connectable" : "connected";
}

const STATUS_TAG: Record<AppStatus, string> = {
  connected: "",
  connectable: ", NOT CONNECTED",
  blocked: ", TURNED OFF",
  unknown: ", not a known app",
};

const MAX_ITEMS = 30;
const DETAILED_ITEMS = 2;
const MAX_DETAILED_CHARS = 3_300;
const MAX_DESCRIPTION_CHARS = 200;

export function renderSearchItems(items: ToolMatch[]): string {
  const shown = items.slice(0, MAX_ITEMS);
  let actionsSeen = 0;
  let signatures = false;
  let files = false;
  const lines = shown.map((m) => {
    const tag = STATUS_TAG[statusOf(m)];
    const description = clip(m.description, MAX_DESCRIPTION_CHARS);
    if (m.action === "") {
      return `- ${m.toolkit} (app${tag}): ${description}`;
    }
    const header = `- ${m.action} (${m.toolkit}${tag}): ${description}`;
    if (m.inputParams === undefined) return header;
    const view = presentFileParams(m.inputParams);
    files ||= view.hasFiles;
    const inputParams = view.schema;
    const detailed = actionsSeen++ < DETAILED_ITEMS;
    if (detailed) {
      try {
        const full = JSON.stringify(inputParams);
        if (full.length <= 2000) return `${header}\n  params: ${full}`;
      } catch (error) {
        if (!(error instanceof RangeError)) throw error;
      }
    }
    const signature = schemaSignature(inputParams);
    if (!signature) return header;
    const summary = `${header}\n  params: ${signature}`;
    signatures = true;
    return detailed
      ? summary +
          parameterDetails(inputParams, MAX_DETAILED_CHARS - summary.length)
      : summary;
  });
  const notes: string[] = [];
  if (items.length > shown.length) {
    notes.push(
      `(+${items.length - shown.length} more matched but are not shown - narrow the query, or set \`app\` to the one you need.)`,
    );
  }
  if (files) notes.push(FILE_PARAM_NOTE);
  if (signatures) {
    notes.push(
      `(Some actions show only a params signature. ${parameterLookupInstruction()})`,
    );
  }
  return [...notes, ...lines].join("\n");
}
