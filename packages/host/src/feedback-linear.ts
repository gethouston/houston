import {
  FeedbackIntakeError,
  type FeedbackPayload,
  type FeedbackSender,
  formatIssueDescription,
  formatIssueTitle,
  httpRefusalKind,
  isIntakeLimitRefusal,
  truncateChars,
} from "./feedback";

const LINEAR_API_URL = "https://api.linear.app/graphql";

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
      let body = "";
      try {
        body = (await res.text()).trim();
      } catch (err) {
        body = `could not read Linear response body: ${String(err)}`;
      }
      throw new FeedbackIntakeError(
        `Linear API failed: ${res.status}${body ? ` ${truncateChars(body, 160)}` : ""}`,
        httpRefusalKind(res.status, body),
      );
    }
    const parsed = (await res.json()) as {
      data?: T;
      errors?: { message: string; extensions?: unknown }[];
    };
    if (parsed.errors?.length) {
      throw new FeedbackIntakeError(
        `Linear API returned GraphQL errors: ${parsed.errors.map((e) => e.message).join("; ")}`,
        parsed.errors.some(isIntakeLimitRefusal)
          ? "intake_unavailable"
          : "other",
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
