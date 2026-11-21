import type { ToolEntry } from "@houston-ai/chat";

export const AGENT_NAME = "Inbox Zero";

export const USER_TURN = "Can you clear anything Stripe sent this week?";

export const PEER_TURN =
  "Leave the December invoice, I still need to check it.";

export const AGENT_TURN = `Found **4 emails from Stripe** this week:

- 3 receipts, all under $200 — filed under Receipts
- 1 invoice for December — left untouched, as @julian asked

The December invoice is at https://dashboard.stripe.com/invoices when you
want to look at it.`;

export const AGENT_SHORT_TURN =
  "Filed the three receipts. Nothing else needed you.";

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

export const RUNNING_TOOL: ToolEntry = {
  name: "integration_execute",
  input: { tool: "GMAIL_MOVE_TO_LABEL", label: "Receipts" },
};

export const FAILED_TOOL: ToolEntry = {
  name: "integration_execute",
  input: { tool: "GMAIL_MOVE_TO_LABEL", label: "Receipts" },
  result: {
    content: "Label 'Receipts' not found on this account.",
    is_error: true,
  },
};

export const BASH_TOOL: ToolEntry = {
  name: "bash",
  input: { command: "ls ~/.houston/workspaces/Personal" },
  result: { content: "Inbox Zero\nMeeting Notes", is_error: false },
};
