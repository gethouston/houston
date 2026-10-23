import type { ToolMatch } from "./integrations-render";

type Account = NonNullable<ToolMatch["accounts"]>[number];

export const ACCOUNT_SELECTION_GUIDANCE =
  "When the app has several connected accounts, always pass `account`; never omit it. Choose an account yourself only when the user's words, the task, or an earlier choice in this conversation unambiguously identify one of the listed accounts. If ANY account lacks an identity label and the choice is still unclear, you MUST ask ONE ask_user question before acting, even for read-only actions. Describe each account by its identity label (email or workspace name), otherwise 'connected on <date>', otherwise 'account 1' or 'account 2', as listed by integration_search. Never guess which account is work or personal from a connection date or its order. When all accounts have identity labels, ask once if the choice matters and is ambiguous. Once the user chooses, keep using that account for the rest of this conversation without asking again, unless they say otherwise. If no one can answer a question right now and nothing identifies the account, do not act on that app: finish the rest, then say plainly which accounts you found and that the user needs to pick one, because that always needs their attention. Never show an internal account id to the user, and never ask when the app has a single account.";

// UTC because the runtime does not know the user's timezone; the date only has
// to tell accounts apart, not match a local calendar to the minute.
const connectionDate = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  const suffix = ["th", "st", "nd", "rd"][n % 10] ?? "th";
  return `${n}${suffix}`;
}

function connectedAt(account: Account): number | undefined {
  if (account.label?.trim() || !account.createdAt) return undefined;
  const at = new Date(account.createdAt).getTime();
  return Number.isNaN(at) ? undefined : at;
}

/**
 * Each account's plain description: its identity label, else its connection
 * date, else an ordinal. Two unnamed accounts connected on the same day would
 * read as twins, so those carry their connection order within that day.
 */
function accountDescriptions(accounts: Account[]): string[] {
  const days = accounts.map((account) => {
    const at = connectedAt(account);
    return at === undefined ? undefined : connectionDate.format(at);
  });
  return accounts.map((account, index) => {
    const label = account.label?.trim();
    if (label) return label;
    const day = days[index];
    if (day === undefined) return `account ${index + 1}`;
    const sameDay = accounts
      .map((other, i) => ({ i, at: connectedAt(other) ?? 0 }))
      .filter(({ i }) => days[i] === day)
      .sort((a, b) => a.at - b.at || a.i - b.i);
    if (sameDay.length === 1) return `connected on ${day}`;
    const rank = sameDay.findIndex(({ i }) => i === index) + 1;
    return `connected on ${day}, the ${ordinal(rank)} of ${sameDay.length} that day`;
  });
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
  const lines = [...byToolkit].map(([toolkit, accounts]) => {
    const descriptions = accountDescriptions(accounts);
    return `- ${toolkit}: ${accounts
      .map((account, index) => `${account.id} (${descriptions[index]})`)
      .join(", ")}`;
  });
  return `These apps have MULTIPLE accounts connected:\n${lines.join("\n")}\n${ACCOUNT_SELECTION_GUIDANCE}`;
}
