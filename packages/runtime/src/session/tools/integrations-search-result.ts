import { multiAccountNote } from "./integrations-accounts";
import {
  type AppStatus,
  renderSearchItems,
  statusOf,
  type ToolMatch,
} from "./integrations-render";

/**
 * The instruction appended to search results (and connection-shaped execute
 * failures) that teaches the model the in-chat connect hand-off: call the
 * `request_connection` tool, which records the pending connection so Houston
 * renders a one-click connect card in place of the chat input.
 */
export const REQUEST_CONNECTION_GUIDANCE =
  "To let the user connect an app, call the request_connection tool with that app's toolkit (the slug shown in the results). The user gets a one-click connect card in place of the chat input, and you automatically get a message once the connection is live so you can continue - do not ask the user to confirm.";

/**
 * Search results get a MUCH tighter ceiling than execute data: they are a
 * pick-list, and past ~24 KB they stop fitting the backend's tool-result
 * budget at all (the 67 KB Croma search spilled to a file and rotted the
 * turn). renderSearchItems' own budgets keep typical results a few KB; this
 * is the backstop.
 */
const MAX_SEARCH_RESULT_CHARS = 24 * 1024;

const CUT_NOTE =
  "This list runs past the 24 KB search-result limit, so it is cut off before its end. Search again with a more specific query to see the actions that were cut off.";

/**
 * A non-empty search result: every rule for the model, then the action list.
 * The rules lead because both backends cut a long result to its first 8k
 * characters (tool-results/cap.ts), and a list of full schemas fills that
 * head on its own.
 */
export function searchResultText(items: ToolMatch[], leadNote: string): string {
  const slugsWith = (s: AppStatus) => [
    ...new Set(items.filter((m) => statusOf(m) === s).map((m) => m.toolkit)),
  ];
  const rules = [multiAccountNote(items)];
  const connectable = slugsWith("connectable");
  if (connectable.length > 0) {
    rules.push(
      `These apps exist but are not connected yet (${connectable.join(", ")}). ${REQUEST_CONNECTION_GUIDANCE}`,
    );
  }
  const blocked = slugsWith("blocked");
  if (blocked.length > 0) {
    rules.push(
      `These apps are turned off for this agent (${blocked.join(", ")}). Tell the user they can be switched on in this agent's Settings, under Apps (someone who manages the agent can do it; otherwise they should ask whoever does). Do NOT call request_connection for these, and never imply they are unsupported.`,
    );
  }
  const list = renderSearchItems(items);
  const lead = rules
    .filter(Boolean)
    .map((rule) => `${rule}\n\n`)
    .join("");
  const text = leadNote + lead + list;
  if (text.length <= MAX_SEARCH_RESULT_CHARS) return text;
  return `${leadNote}${lead}${CUT_NOTE}\n\n${list}`.slice(
    0,
    MAX_SEARCH_RESULT_CHARS,
  );
}
