import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { Agent, OrgMember, UsageRow } from "@houston/engine-adapter";
import {
  orgChartUsage,
  orgChartWork,
} from "../src/components/organization/org-chart-model.ts";
import {
  heroFigures,
  heroMessagesRead,
  orgChartScope,
} from "../src/components/organization/org-chart-scope.ts";
import {
  buildLedger,
  ledgerColumns,
  orgChartLead,
  orgChartRead,
  orgChartState,
} from "../src/components/organization/org-chart-view-model.ts";

const NOW = new Date("2026-09-26T12:00:00Z");
const HOUR = 3_600_000;
const members: OrgMember[] = [
  { userId: "julian", role: "owner", displayName: "Julian Arango" },
  { userId: "sara", role: "admin", displayName: "Sara Diaz" },
  { userId: "tom", role: "user", displayName: "Tom Reed" },
  { userId: "ana", role: "user", displayName: "Ana Ruiz" },
];
const agent = (id: string, extra: Partial<Agent> = {}): Agent => ({
  id,
  name: id,
  folderPath: `ws/${id}`,
  configId: "c",
  createdAt: "2026-01-01",
  assignments: [],
  ...extra,
});
const talk = (
  agentSlug: string,
  userId: string,
  messages: number,
): UsageRow => ({
  agentSlug,
  userId,
  day: "2026-09-26",
  messages,
});
const hours = (agentSlug: string, h: number) => ({
  agentSlug,
  day: "2026-09-26",
  activeMs: h * HOUR,
  awakeMs: h * HOUR,
  wakes: 1,
  turns: 1,
  routineRuns: 0,
});

const agents = [agent("kevin"), agent("rob"), agent("finance")];
const usage = orgChartUsage(
  agents,
  [
    talk("kevin", "tom", 412),
    talk("rob", "tom", 268),
    talk("finance", "tom", 530),
  ],
  NOW,
);

describe("buildLedger", () => {
  it("ranks by hours worked, messages breaking ties, then by name", () => {
    const work = orgChartWork(
      agents,
      [hours("ws/kevin", 56), hours("ws/rob", 72), hours("ws/finance", 56)],
      NOW,
    );
    const lines = buildLedger(agents, members, {
      unnamedAccount: "Unnamed account",
      work,
      usage,
      scope: "org",
    });
    deepStrictEqual(
      lines.map((l) => [l.id, l.workMs / HOUR, l.messages]),
      [
        ["rob", 72, 268],
        ["finance", 56, 530],
        ["kevin", 56, 412],
      ],
    );
    strictEqual(lines[0]?.share, 1);
    strictEqual(lines[2]?.share, 56 / 72);
  });

  it("ranks and scales by messages when hours cannot be read", () => {
    const lines = buildLedger(agents, members, {
      unnamedAccount: "Unnamed account",
      work: null,
      usage,
      scope: "org",
    });
    deepStrictEqual(
      lines.map((l) => l.id),
      ["finance", "kevin", "rob"],
    );
    strictEqual(lines[1]?.share, 412 / 530);
  });

  it("falls back to names, bars empty, when nothing can be read", () => {
    const lines = buildLedger(agents, members, {
      unnamedAccount: "Unnamed account",
      work: null,
      usage: null,
      scope: "org",
    });
    deepStrictEqual(
      lines.map((l) => [l.id, l.share]),
      [
        ["finance", 0],
        ["kevin", 0],
        ["rob", 0],
      ],
    );
  });

  it("splits people into managers (the owner by default) and users, busiest first", () => {
    const shared = agent("shared", {
      assignments: [
        { userId: "tom", access: "user" },
        { userId: "ana", access: "user" },
      ],
    });
    const counted = orgChartUsage(
      [shared],
      [talk("ws/shared", "ana", 40), talk("ws/shared", "tom", 3)],
      NOW,
    );
    const [line] = buildLedger([shared], members, {
      unnamedAccount: "Unnamed account",
      work: null,
      usage: counted,
      scope: "org",
    });
    deepStrictEqual(
      line?.people?.manages.map((p) => p.userId),
      ["julian"],
    );
    const uses = line?.people?.uses;
    deepStrictEqual(uses === "everyone" ? uses : uses?.map((p) => p.userId), [
      "ana",
      "tom",
    ]);
  });

  it("keeps explicit managers and hides people the caller cannot see", () => {
    const managed = agent("managed", {
      assignments: [{ userId: "sara", access: "manager" }],
    });
    const hidden = agent("hidden", { assignments: undefined });
    const lines = buildLedger([managed, hidden], members, {
      unnamedAccount: "Unnamed account",
      work: null,
      usage: null,
      scope: "org",
    });
    const byId = new Map(lines.map((l) => [l.id, l]));
    deepStrictEqual(
      byId.get("managed")?.people?.manages.map((p) => p.userId),
      ["julian", "sara"],
    );
    deepStrictEqual(byId.get("managed")?.people?.uses, []);
    strictEqual(byId.get("hidden")?.people, null);
  });
});

describe("an admin's chart, scoped to their own AI Employees", () => {
  const mine = [
    agent("kevin", { access: "manager" }),
    agent("rob", { access: "user", assignments: undefined }),
  ];
  const counts = orgChartUsage(
    mine,
    [talk("kevin", "tom", 412), talk("rob", "tom", 268)],
    NOW,
  );
  const work = orgChartWork(
    mine,
    [hours("ws/kevin", 5), hours("ws/rob", 7)],
    NOW,
  );

  it("scopes owners to the organization and everyone else to theirs", () => {
    strictEqual(orgChartScope({ role: "owner", personal: false }), "org");
    strictEqual(orgChartScope({ role: "admin", personal: false }), "yours");
    strictEqual(orgChartScope({ role: "owner", personal: true }), "personal");
  });

  it("says Not counted for a line whose messages the gateway does not count", () => {
    const lines = buildLedger(mine, members, {
      unnamedAccount: "Unnamed account",
      work,
      usage: counts,
      scope: "yours",
    });
    const byId = new Map(lines.map((l) => [l.id, l.messages]));
    strictEqual(byId.get("kevin"), 412);
    strictEqual(byId.get("rob"), null);
  });

  it("counts every line for the owner", () => {
    const lines = buildLedger(mine, members, {
      unnamedAccount: "Unnamed account",
      work,
      usage: counts,
      scope: "org",
    });
    deepStrictEqual(
      lines.map((l) => l.messages),
      [268, 412],
    );
  });

  it("totals only managed messages for an admin with mixed access", () => {
    const lines = buildLedger(mine, members, {
      unnamedAccount: "Unnamed account",
      work,
      usage: counts,
      scope: "yours",
    });
    deepStrictEqual(
      heroFigures({ scope: "yours", lines, people: 4, work, usage: counts }),
      {
        scope: "yours",
        agents: 2,
        people: null,
        workMs: 12 * HOUR,
        messages: 412,
        messagesScoped: true,
      },
    );
    const managed = lines.filter((l) => l.id === "kevin");
    strictEqual(
      heroFigures({
        scope: "yours",
        lines: managed,
        people: 4,
        work,
        usage: counts,
      }).messages,
      412,
    );
    const withoutHours = heroFigures({
      scope: "yours",
      lines,
      people: 4,
      work: null,
      usage: counts,
    });
    strictEqual(withoutHours.messages, 412);
    deepStrictEqual(
      orgChartLead("hidden", heroMessagesRead("ready", withoutHours.messages)),
      {
        metric: "messages",
        loading: false,
      },
    );
  });

  it("shows no messages lead when an admin manages none of the lines", () => {
    const onlyUsed = [agent("rob", { access: "user" })];
    const lines = buildLedger(onlyUsed, members, {
      unnamedAccount: "Unnamed account",
      work: null,
      usage: counts,
      scope: "yours",
    });
    strictEqual(lines[0]?.messages, null);
    const figures = heroFigures({
      scope: "yours",
      lines,
      people: 4,
      work: null,
      usage: counts,
    });
    strictEqual(figures.messages, null);
    strictEqual(heroMessagesRead("ready", figures.messages), "hidden");
  });

  it("ranks counted messages before uncounted lines, then by name", () => {
    const mixed = [
      agent("aardvark", { access: "user" }),
      agent("zeta", { access: "manager" }),
      agent("beta", { access: "user" }),
    ];
    const counted = orgChartUsage(mixed, [talk("zeta", "tom", 7)], NOW);
    const lines = buildLedger(mixed, members, {
      unnamedAccount: "Unnamed account",
      work: null,
      usage: counted,
      scope: "yours",
    });
    deepStrictEqual(
      lines.map((line) => [line.id, line.messages]),
      [
        ["zeta", 7],
        ["aardvark", null],
        ["beta", null],
      ],
    );
    strictEqual(lines[0]?.share, 1);
  });

  it("uses name order when no metric is readable", () => {
    const mixed = [
      agent("zeta", { access: "manager" }),
      agent("aardvark", { access: "user" }),
    ];
    const lines = buildLedger(mixed, members, {
      unnamedAccount: "Unnamed account",
      work: null,
      usage: null,
      scope: "yours",
    });
    deepStrictEqual(
      lines.map((line) => line.id),
      ["aardvark", "zeta"],
    );
  });

  it("gives the owner the organization's figures, people included", () => {
    const lines = buildLedger(mine, members, {
      unnamedAccount: "Unnamed account",
      work,
      usage: counts,
      scope: "org",
    });
    deepStrictEqual(
      heroFigures({ scope: "org", lines, people: 4, work, usage: counts }),
      {
        scope: "org",
        agents: 2,
        people: 4,
        workMs: 12 * HOUR,
        messages: 680,
        messagesScoped: false,
      },
    );
    strictEqual(
      heroFigures({ scope: "org", lines, people: 4, work: null, usage: null })
        .workMs,
      null,
    );
    const withoutHours = heroFigures({
      scope: "org",
      lines,
      people: 4,
      work: null,
      usage: counts,
    });
    strictEqual(withoutHours.messages, 680);
    strictEqual(withoutHours.messagesScoped, false);
    strictEqual(
      orgChartLead("hidden", heroMessagesRead("ready", withoutHours.messages))
        ?.metric,
      "messages",
    );
  });

  it("hands the hero no messages figure when the count is partial", () => {
    strictEqual(heroMessagesRead("ready", null), "hidden");
    strictEqual(heroMessagesRead("ready", 3), "ready");
    strictEqual(heroMessagesRead("loading", null), "loading");
    strictEqual(heroMessagesRead("error", null), "error");
  });
});

describe("orgChartRead", () => {
  it("is hidden when off, ready with data, error without, loading otherwise", () => {
    const read = (enabled: boolean, hasData: boolean, isError: boolean) =>
      orgChartRead({ enabled, hasData, isError });
    strictEqual(read(false, true, false), "hidden");
    strictEqual(read(true, true, true), "ready");
    strictEqual(read(true, false, true), "error");
    // A query parked off screen has neither data nor error: still loading.
    strictEqual(read(true, false, false), "loading");
  });
});

describe("orgChartLead", () => {
  it("leads with hours, holding them while they load", () => {
    deepStrictEqual(orgChartLead("ready", "ready"), {
      metric: "hours",
      loading: false,
    });
    deepStrictEqual(orgChartLead("loading", "ready"), {
      metric: "hours",
      loading: true,
    });
  });

  it("falls back to messages when hours are off or failed, else to nothing", () => {
    deepStrictEqual(orgChartLead("hidden", "ready"), {
      metric: "messages",
      loading: false,
    });
    deepStrictEqual(orgChartLead("error", "loading"), {
      metric: "messages",
      loading: true,
    });
    strictEqual(orgChartLead("hidden", "hidden"), null);
    strictEqual(orgChartLead("error", "error"), null);
  });
});

describe("ledgerColumns", () => {
  it("gives messages their own column only beside hours", () => {
    const hoursLead = orgChartLead("ready", "ready");
    strictEqual(ledgerColumns(hoursLead, "ready", false).messages, "ready");
    strictEqual(ledgerColumns(hoursLead, "error", false).messages, null);
    const messagesLead = orgChartLead("hidden", "ready");
    strictEqual(ledgerColumns(messagesLead, "ready", false).messages, null);
    strictEqual(
      ledgerColumns(messagesLead, "ready", false).bar?.metric,
      "messages",
    );
  });

  it("draws no people columns in a personal space", () => {
    strictEqual(ledgerColumns(null, "hidden", true).people, false);
    strictEqual(ledgerColumns(null, "hidden", false).people, true);
  });
});

describe("orgChartState", () => {
  it("loads until the roster lands, then is empty or ready", () => {
    strictEqual(
      orgChartState({ agentsLoaded: false, agentCount: 3 }),
      "loading",
    );
    strictEqual(orgChartState({ agentsLoaded: true, agentCount: 0 }), "empty");
    strictEqual(orgChartState({ agentsLoaded: true, agentCount: 1 }), "ready");
  });
});
