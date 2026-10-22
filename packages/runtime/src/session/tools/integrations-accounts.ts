import type { ToolMatch } from "./integrations-render";

type Account = NonNullable<ToolMatch["accounts"]>[number];

export const ACCOUNT_SELECTION_GUIDANCE =
  "When the app has several connected accounts, always pass `account`; never omit it. Choose an account yourself only when the user's words or the task unambiguously identify one of the listed accounts. If ANY account lacks an identity label and the choice is still unclear, you MUST ask ONE ask_user question before acting, even for read-only actions. Describe each account by its identity label (email or workspace name), otherwise 'connected on <date>', otherwise 'account 1' or 'account 2', as listed by integration_search. Never guess which account is work or personal from a connection date or its order. When all accounts have identity labels, ask once if the choice matters and is ambiguous. Once the user chooses, use that account without asking again for the same task. If you cannot ask, do not act until the account is clear. Never show an internal account id to the user, and never ask when the app has a single account.";

const connectionDate = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

function accountDescription(account: Account, index: number): string {
  const label = account.label?.trim();
  if (label) return label;
  const date = account.createdAt ? new Date(account.createdAt) : undefined;
  if (date && !Number.isNaN(date.getTime())) {
    return `connected on ${connectionDate.format(date)}`;
  }
  return `account ${index + 1}`;
}

/** List each app once, keeping human descriptions beside the execute target. */
export function multiAccountNote(items: ToolMatch[]): string {
  const byToolkit = new Map<string, Account[]>();
  for (const item of items) {
    if (
      item.accounts &&
      item.accounts.length > 1 &&
      !byToolkit.has(item.toolkit)
    ) {
      byToolkit.set(item.toolkit, item.accounts);
    }
  }
  if (byToolkit.size === 0) return "";
  const lines = [...byToolkit].map(
    ([toolkit, accounts]) =>
      `- ${toolkit}: ${accounts
        .map(
          (account, index) =>
            `${account.id} (${accountDescription(account, index)})`,
        )
        .join(", ")}`,
  );
  return `These apps have MULTIPLE accounts connected:\n${lines.join("\n")}\n${ACCOUNT_SELECTION_GUIDANCE}`;
}
