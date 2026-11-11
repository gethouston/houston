import "../../../app/tests/support/dom-env";
import type { MissionStartFacts } from "@houston/sdk/mission-started-by";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Agent } from "../../../app/src/lib/types";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string>) =>
      values?.name ? `${key}:${values.name}` : key,
    i18n: { language: "en" },
  }),
}));

import { AgentMissionRow } from "../../../app/src/components/agents-home/agent-mission-row";
import { useMissionOriginTag } from "../../../app/src/hooks/use-mission-origin-tag";

const mission = {
  id: "m1",
  title: "Draft the launch email",
  type: "activity" as const,
  agent_path: "Personal/Writer",
};
const roster = [
  { id: "writer", folderPath: "Personal/Writer", name: "Marisol" },
] as Agent[];

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

describe("AgentMissionRow", () => {
  it("wears the origin tag beside the status tag", async () => {
    await act(async () =>
      root.render(
        <AgentMissionRow
          mission={mission}
          status="done"
          originTag="Started by Houston"
          onOpen={() => {}}
        />,
      ),
    );
    const tags = host.querySelector('[data-testid="agent-mission-status"]')
      ?.parentElement?.children;
    expect(
      [...(tags ?? [])].map((tag) => tag.getAttribute("data-testid")),
    ).toEqual(["agent-mission-status", "agent-mission-origin"]);
    expect(
      host.querySelector('[data-testid="agent-mission-origin"]')?.textContent,
    ).toBe("Started by Houston");
  });

  it("shows the API origin on a phone mission row", async () => {
    await act(async () =>
      root.render(
        <AgentMissionRow
          mission={mission}
          status="needs_you"
          originTag="Started through the API"
          onOpen={() => {}}
        />,
      ),
    );
    expect(
      host.querySelector('[data-testid="agent-mission-origin"]')?.textContent,
    ).toBe("Started through the API");
  });

  it("wears no origin tag on the user's own task", async () => {
    await act(async () =>
      root.render(
        <AgentMissionRow mission={mission} status="done" onOpen={() => {}} />,
      ),
    );
    expect(
      host.querySelector('[data-testid="agent-mission-origin"]'),
    ).toBeNull();
    expect(
      host.querySelector('[data-testid="agent-mission-status"]'),
    ).not.toBeNull();
  });
});

describe("useMissionOriginTag", () => {
  function Probe({ rows }: { rows: MissionStartFacts[] }) {
    const originTagOf = useMissionOriginTag(roster);
    return (
      <ul>
        {rows.map((row, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: a fixed probe list
          <li key={i}>{originTagOf(row) ?? "none"}</li>
        ))}
      </ul>
    );
  }

  it("puts the SDK's decision into the board's words, naming known employees", async () => {
    await act(async () =>
      root.render(
        <Probe
          rows={[
            { started_by: "houston" },
            { started_by: "api" },
            { started_by: "employee", origin_agent: "writer" },
            { started_by: "employee", origin_agent: "gone" },
            { origin_session_key: "conv-parent" },
            { routine_id: "r1", started_by: "houston" },
            {},
          ]}
        />,
      ),
    );
    expect(
      [...host.querySelectorAll("li")].map((li) => li.textContent),
    ).toEqual([
      "tags.houstonStarted",
      "tags.apiStarted",
      "tags.startedByAgent:Marisol",
      "tags.agentStarted",
      "tags.agentStarted",
      "tags.routine",
      "none",
    ]);
  });
});
