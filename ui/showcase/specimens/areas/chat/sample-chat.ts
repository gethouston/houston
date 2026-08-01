/**
 * One fake mission, shared by every Chat specimen.
 *
 * The pages render `@houston-ai/chat` with props alone — no engine, no feed,
 * no query client — so the conversation has to come from somewhere. It comes
 * from here, written once so every page shows the SAME mission and the rail
 * reads as one screen rather than eight unrelated fixtures.
 */

import type { ToolEntry } from "@houston-ai/chat";

/** The agent this mission belongs to. */
export const AGENT_NAME = "Inbox Zero";

/** The user's opening turn. */
export const USER_TURN = "Can you clear anything Stripe sent this week?";

/** A teammate's turn in the same shared conversation (multiplayer). */
export const PEER_TURN =
  "Leave the December invoice, I still need to check it.";

/**
 * The agent's reply, as markdown — lists, bold and a bare link, which is the
 * mix `MessageResponse` is actually asked to render in the product.
 */
export const AGENT_TURN = `Found **4 emails from Stripe** this week:

- 3 receipts, all under $200 — filed under Receipts
- 1 invoice for December — left untouched, as @julian asked

The December invoice is at https://dashboard.stripe.com/invoices when you
want to look at it.`;

/** A short assistant turn, for rows that only need one line of prose. */
export const AGENT_SHORT_TURN =
  "Filed the three receipts. Nothing else needed you.";

/** The tool calls that produced the reply above, in the order they ran. */
export const SAMPLE_TOOLS: ToolEntry[] = [
  {
    name: "integration_search",
    input: { query: "gmail search messages" },
    result: {
      content: "GMAIL_FETCH_EMAILS, GMAIL_CREATE_LABEL, GMAIL_MOVE_TO_LABEL",
      is_error: false,
    },
  },
  {
    name: "integration_execute",
    input: {
      tool: "GMAIL_FETCH_EMAILS",
      query: "from:stripe.com newer_than:7d",
    },
    result: { content: "4 messages matched.", is_error: false },
  },
  {
    name: "Read",
    input: { file_path: "/Users/julian/.houston/Inbox Zero/receipts.md" },
    result: {
      content: "# Receipts\n\n- Nov 3, Stripe, $49.00",
      is_error: false,
    },
  },
];

/** The tool that is still running — the last row of a streaming turn. */
export const RUNNING_TOOL: ToolEntry = {
  name: "integration_execute",
  input: { tool: "GMAIL_MOVE_TO_LABEL", label: "Receipts" },
};

/** A tool that came back with a failure, so the error path is on the page. */
export const FAILED_TOOL: ToolEntry = {
  name: "integration_execute",
  input: { tool: "GMAIL_MOVE_TO_LABEL", label: "Receipts" },
  result: {
    content: "Label 'Receipts' not found on this account.",
    is_error: true,
  },
};

/** Shell output, which `ToolBlock` deliberately keeps collapsed at rest. */
export const BASH_TOOL: ToolEntry = {
  name: "bash",
  input: { command: "ls ~/.houston/workspaces/Personal" },
  result: { content: "Inbox Zero\nMeeting Notes", is_error: false },
};
