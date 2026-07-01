/**
 * Feedback intake for the web build: `POST /feedback` → a Linear issue.
 *
 * The desktop app files feedback/bug reports straight to Linear through a Tauri
 * command (app/src-tauri/src/bug_report). A browser tab has no Tauri and must
 * not hold a Linear key, so the control plane fronts the same flow: the web
 * shim posts the identical payload here and this module formats + files it.
 * Title/description formatting mirrors bug_report/format.rs so web and desktop
 * reports read the same in the Linear queue.
 */

const LINEAR_API_URL = "https://api.linear.app/graphql";
const MAX_ERROR_CHARS = 6_000;
const MAX_LOG_CHARS = 8_000;

/** Mirrors the desktop BugReportPayload (camelCase wire shape). */
export interface FeedbackPayload {
  command: string;
  error: string;
  spaceName?: string;
  workspaceName?: string;
  userEmail?: string | null;
  timestamp: string;
  appVersion: string;
  logs?: { backend?: string; frontend?: string };
  /** Free-text the user typed (voluntary "Send feedback" only). */
  userMessage?: string;
}

export interface FeedbackSender {
  /** Files the report; resolves to the issue identifier (e.g. "BUG-123") or null. */
  send(payload: FeedbackPayload, userId: string): Promise<string | null>;
}

// ---------------------------------------------------------------------------
// Formatting (port of bug_report/format.rs)
// ---------------------------------------------------------------------------

const collapseWhitespace = (s: string): string =>
  s.split(/\s+/).filter(Boolean).join(" ");

const truncateChars = (s: string, max: number): string =>
  s.length <= max ? s : `${s.slice(0, Math.max(0, max - 3))}...`;

const truncateStart = (s: string, max: number): string =>
  s.length <= max ? s : `...\n${s.slice(s.length - Math.max(0, max - 4))}`;

function codeBlock(language: string, content: string): string {
  const longestRun = Math.max(
    0,
    ...content.split(/[^`]+/).map((r) => r.length),
  );
  const fence = "`".repeat(Math.max(3, longestRun + 1));
  return `${fence}${language}\n${content}\n${fence}\n`;
}

export function formatIssueTitle(p: FeedbackPayload): string {
  const message = collapseWhitespace(p.userMessage ?? "");
  if (message) return truncateChars(`Houston feedback: ${message}`, 140);
  const command = collapseWhitespace(p.command);
  const summary = collapseWhitespace(p.error.split("\n")[0] ?? "");
  return truncateChars(
    summary
      ? `Houston bug: ${command} - ${summary}`
      : `Houston bug: ${command}`,
    140,
  );
}

export function formatIssueDescription(
  p: FeedbackPayload,
  userId: string,
): string {
  let d = "";
  const message = (p.userMessage ?? "").trim();
  if (message) d += `## What the user said\n\n${message}\n\n`;
  d += `## Error\n\n${codeBlock("text", truncateStart(p.error, MAX_ERROR_CHARS))}`;
  d += "\n## Context\n\n";
  const line = (label: string, value: string | null | undefined) => {
    if (value) d += `- ${label}: ${value}\n`;
  };
  line("Command", p.command);
  line("Surface", "Houston Web (cloud)");
  line("Timestamp", p.timestamp);
  line("App Version", p.appVersion);
  line("User", p.userEmail ?? undefined);
  line("User Id", userId);
  line("Space", p.spaceName);
  line("Workspace", p.workspaceName);
  const backend = p.logs?.backend ?? "";
  const frontend = p.logs?.frontend ?? "";
  if (backend)
    d += `\n## Backend Logs (last 50 lines)\n\n${codeBlock("text", truncateStart(backend, MAX_LOG_CHARS))}`;
  if (frontend)
    d += `\n## Frontend Logs (last 50 lines)\n\n${codeBlock("text", truncateStart(frontend, MAX_LOG_CHARS))}`;
  return d;
}

// ---------------------------------------------------------------------------
// Linear sender (port of bug_report/linear.rs)
// ---------------------------------------------------------------------------

const ISSUE_CREATE_MUTATION = `
mutation HoustonBugReportCreate($input: IssueCreateInput!) {
  issueCreate(input: $input) {
    success
    issue { id identifier url }
  }
}
`;

const LABEL_QUERY = `
query HoustonBugReportLabel($teamId: String!, $labelName: String!) {
  team(id: $teamId) {
    labels(first: 10, filter: { name: { eq: $labelName } }) {
      nodes { id name }
    }
  }
}
`;

export interface LinearFeedbackConfig {
  apiKey: string;
  teamId: string;
  labelName: string;
  apiUrl?: string;
}

export class LinearFeedbackSender implements FeedbackSender {
  constructor(private readonly cfg: LinearFeedbackConfig) {}

  private async graphql<T>(query: string, variables: unknown): Promise<T> {
    const res = await fetch(this.cfg.apiUrl ?? LINEAR_API_URL, {
      method: "POST",
      headers: {
        Authorization: this.cfg.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, variables }),
    });
    if (!res.ok) {
      const body = (await res.text().catch(() => "")).trim();
      throw new Error(
        `Linear API failed: ${res.status}${body ? ` ${truncateChars(body, 160)}` : ""}`,
      );
    }
    const parsed = (await res.json()) as {
      data?: T;
      errors?: { message: string }[];
    };
    if (parsed.errors?.length) {
      throw new Error(
        `Linear API returned GraphQL errors: ${parsed.errors.map((e) => e.message).join("; ")}`,
      );
    }
    if (!parsed.data)
      throw new Error("Linear API response did not include data");
    return parsed.data;
  }

  private async resolveLabelId(): Promise<string> {
    const data = await this.graphql<{
      team: { labels: { nodes: { id: string; name: string }[] } } | null;
    }>(LABEL_QUERY, { teamId: this.cfg.teamId, labelName: this.cfg.labelName });
    if (!data.team)
      throw new Error(`Linear team not found: ${this.cfg.teamId}`);
    const label = data.team.labels.nodes.find(
      (l) => l.name === this.cfg.labelName,
    );
    if (!label)
      throw new Error(`Linear bug label not found: ${this.cfg.labelName}`);
    return label.id;
  }

  async send(payload: FeedbackPayload, userId: string): Promise<string | null> {
    const labelId = await this.resolveLabelId();
    const data = await this.graphql<{
      issueCreate: {
        success: boolean;
        issue: { id: string; identifier: string | null } | null;
      } | null;
    }>(ISSUE_CREATE_MUTATION, {
      input: {
        teamId: this.cfg.teamId,
        title: formatIssueTitle(payload),
        description: formatIssueDescription(payload, userId),
        labelIds: [labelId],
      },
    });
    if (!data.issueCreate?.success)
      throw new Error("Linear issue creation failed");
    return data.issueCreate.issue?.identifier ?? null;
  }
}

/** Parse + bound the untrusted request body into a FeedbackPayload, or throw. */
export function parseFeedbackPayload(
  body: Record<string, unknown>,
): FeedbackPayload {
  const str = (v: unknown, max: number): string =>
    typeof v === "string" ? v.slice(0, max) : "";
  const opt = (v: unknown, max: number): string | undefined =>
    typeof v === "string" && v ? v.slice(0, max) : undefined;
  const command = str(body.command, 200);
  if (!command) throw new Error("missing 'command'");
  const logs = (body.logs ?? {}) as Record<string, unknown>;
  return {
    command,
    error: str(body.error, 20_000),
    spaceName: opt(body.spaceName, 200),
    workspaceName: opt(body.workspaceName, 200),
    userEmail: opt(body.userEmail, 320),
    timestamp: str(body.timestamp, 64),
    appVersion: str(body.appVersion, 64),
    logs: {
      backend: str(logs.backend, 50_000),
      frontend: str(logs.frontend, 50_000),
    },
    userMessage: opt(body.userMessage, 10_000),
  };
}
