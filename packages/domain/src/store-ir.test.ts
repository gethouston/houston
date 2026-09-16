import type { AgentProvenance } from "@houston/agentstore-contract";
import type { Learning, Routine } from "@houston/protocol";
import { describe, expect, test } from "vitest";
import type { PortableContent } from "./portable";
import { normalizeRoutines } from "./routines";
import {
  irFromPortable,
  portableFromIr,
  storePackageFromIrPayload,
} from "./store-ir";

const provenance: AgentProvenance = {
  createdVia: "houston",
  exporter: "houston-app",
  houstonVersion: "1.2.3",
  anonymized: false,
};

const baseOpts = {
  identity: {
    name: "Sales Copilot",
    description: "Handles inbound sales.",
    category: "productivity",
  },
  creator: { displayName: "Dana" },
  integrations: [] as string[],
  provenance,
};

const routine: Routine = {
  id: "r1",
  name: "Daily",
  prompt: "check inbox",
  schedule: "0 9 * * *",
  enabled: true,
  suppress_when_silent: false,
  chat_mode: "shared",
  integrations: [],
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

const composioRoutine: Routine = {
  id: "r2",
  name: "New mail",
  prompt: "summarize the mail",
  trigger: {
    kind: "composio",
    toolkit: "gmail",
    trigger_slug: "GMAIL_NEW_GMAIL_MESSAGE",
    trigger_config: { labelIds: "INBOX" },
    connected_account_id: "ca_local_only",
  },
  enabled: false,
  suppress_when_silent: true,
  chat_mode: "per_run",
  provider: "anthropic",
  model: "claude-opus-4-8",
  effort: "high",
  integrations: ["gmail"],
  setup_activity_id: "act_1",
  created_by: "user_1",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

const webhookRoutine: Routine = {
  id: "r3",
  name: "External ping",
  prompt: "read the payload",
  trigger: { kind: "webhook", key_prefix: "wh_abcd1234" },
  enabled: true,
  suppress_when_silent: false,
  chat_mode: "shared",
  integrations: [],
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

const allThree = [routine, composioRoutine, webhookRoutine];

describe("irFromPortable", () => {
  test("maps content + identity into a valid IR", () => {
    const content: PortableContent = {
      claudeMd: "# Role\nYou sell things.",
      skills: [{ slug: "research", body: "---\ntitle: Research\n---\nbody" }],
      routines: [routine],
      learnings: [],
    };
    const ir = irFromPortable(content, {
      ...baseOpts,
      identity: { ...baseOpts.identity, tagline: "Your sales sidekick" },
    });
    expect(ir.irVersion).toBe("2.0.0");
    expect(ir.identity.slug).toBe("sales-copilot");
    expect(ir.identity.name).toBe("Sales Copilot");
    expect(ir.identity.tagline).toBe("Your sales sidekick");
    expect(ir.identity.category).toBe("productivity");
    expect(ir.identity.creator.displayName).toBe("Dana");
    expect(ir.instructions).toBe("# Role\nYou sell things.");
    expect(ir.skills).toEqual([
      { slug: "research", body: "---\ntitle: Research\n---\nbody" },
    ]);
    expect(ir.provenance).toEqual(provenance);
  });

  test("omits tagline when not provided", () => {
    const ir = irFromPortable(
      { skills: [], routines: [], learnings: [] },
      baseOpts,
    );
    expect(ir.identity.tagline).toBeUndefined();
  });

  test("empty CLAUDE.md becomes empty instructions", () => {
    const ir = irFromPortable(
      { skills: [], routines: [], learnings: [] },
      baseOpts,
    );
    expect(ir.instructions).toBe("");
  });

  test("integrations are uppercased + deduped via the contract rules", () => {
    const ir = irFromPortable(
      { skills: [], routines: [], learnings: [] },
      {
        ...baseOpts,
        integrations: ["gmail", "GMAIL", "google_maps", "not a slug!"],
      },
    );
    expect(ir.integrations).toEqual(["GMAIL", "GOOGLE_MAPS"]);
  });

  test("learnings carry id/text and their createdAt", () => {
    const learnings: Learning[] = [
      {
        id: "L1",
        text: "prefers email",
        created_at: "2026-02-02T10:00:00.000Z",
      },
    ];
    const ir = irFromPortable(
      { skills: [], routines: [], learnings },
      baseOpts,
    );
    expect(ir.learnings).toEqual([
      {
        id: "L1",
        text: "prefers email",
        createdAt: "2026-02-02T10:00:00.000Z",
      },
    ]);
  });

  test("maps all three wake kinds, dropping every machine-local field", () => {
    const ir = irFromPortable(
      { skills: [], routines: allThree, learnings: [] },
      baseOpts,
    );
    expect(ir.routines).toEqual([
      {
        id: "r1",
        name: "Daily",
        prompt: "check inbox",
        wake: { kind: "schedule", cron: "0 9 * * *" },
        chatMode: "shared",
        suppressWhenSilent: false,
      },
      {
        id: "r2",
        name: "New mail",
        prompt: "summarize the mail",
        wake: {
          kind: "composio",
          toolkit: "gmail",
          triggerSlug: "GMAIL_NEW_GMAIL_MESSAGE",
          triggerConfig: { labelIds: "INBOX" },
        },
        chatMode: "per_run",
        suppressWhenSilent: true,
      },
      {
        id: "r3",
        name: "External ping",
        prompt: "read the payload",
        wake: { kind: "webhook" },
        chatMode: "shared",
        suppressWhenSilent: false,
      },
    ]);
    const serialized = JSON.stringify(ir.routines);
    for (const local of [
      "ca_local_only",
      "wh_abcd1234",
      "claude-opus-4-8",
      "anthropic",
      "high",
      "act_1",
      "user_1",
      "created_at",
      "enabled",
    ]) {
      expect(serialized).not.toContain(local);
    }
  });

  test("a routine with no wake fails validation instead of vanishing", () => {
    const wakeless = { ...routine, schedule: undefined };
    expect(() =>
      irFromPortable(
        { skills: [], routines: [wakeless], learnings: [] },
        baseOpts,
      ),
    ).toThrow();
  });

  test("unions composio wake toolkits into integrations, keeping order", () => {
    const ir = irFromPortable(
      { skills: [], routines: allThree, learnings: [] },
      { ...baseOpts, integrations: ["slack"] },
    );
    expect(ir.integrations).toEqual(["SLACK", "GMAIL"]);
  });

  test("never duplicates a toolkit the publisher already listed", () => {
    const ir = irFromPortable(
      { skills: [], routines: [composioRoutine], learnings: [] },
      { ...baseOpts, integrations: ["GMAIL"] },
    );
    expect(ir.integrations).toEqual(["GMAIL"]);
  });

  test("throws (never silently drops) on an unrepresentable IR", () => {
    // A description over the 20000-char cap cannot be normalized away.
    expect(() =>
      irFromPortable(
        { skills: [], routines: [], learnings: [] },
        {
          ...baseOpts,
          identity: { ...baseOpts.identity, description: "x".repeat(20001) },
        },
      ),
    ).toThrow();
  });
});

describe("portableFromIr", () => {
  test("empty instructions maps back to an absent CLAUDE.md", () => {
    const ir = irFromPortable(
      { skills: [], routines: [], learnings: [] },
      baseOpts,
    );
    const { content, meta } = portableFromIr(ir);
    expect(content.claudeMd).toBeUndefined();
    expect(content.routines).toEqual([]);
    expect(meta).toEqual({
      agentName: "Sales Copilot",
      description: "Handles inbound sales.",
    });
  });
});

describe("portableFromIr routines", () => {
  test("rebuilds each wake kind with install-ready defaults", () => {
    const ir = irFromPortable(
      { skills: [], routines: allThree, learnings: [] },
      baseOpts,
    );
    const { content } = portableFromIr(ir);
    expect(content.routines.map((r) => r.schedule)).toEqual([
      "0 9 * * *",
      undefined,
      undefined,
    ]);
    expect(content.routines.map((r) => r.trigger)).toEqual([
      undefined,
      {
        kind: "composio",
        toolkit: "gmail",
        trigger_slug: "GMAIL_NEW_GMAIL_MESSAGE",
        trigger_config: { labelIds: "INBOX" },
      },
      { kind: "webhook" },
    ]);
    for (const r of content.routines) {
      // An install lands enabled: the installer picked it in the wizard.
      expect(r.enabled).toBe(true);
      expect(r.created_at).not.toBe("");
      expect(r.updated_at).toBe(r.created_at);
    }
    expect(content.routines.map((r) => r.chat_mode)).toEqual([
      "shared",
      "per_run",
      "shared",
    ]);
    expect(content.routines.map((r) => r.suppress_when_silent)).toEqual([
      false,
      true,
      false,
    ]);
    expect(content.routines.map((r) => r.integrations)).toEqual([
      [],
      ["gmail"],
      [],
    ]);
  });

  test("survives the normalize pass the install path runs", () => {
    // portableFromIr already normalizes, so a second pass must be a no-op:
    // every routine keeps exactly one wake mechanism and nothing is dropped.
    const ir = irFromPortable(
      { skills: [], routines: allThree, learnings: [] },
      baseOpts,
    );
    const { content } = portableFromIr(ir);
    const again = normalizeRoutines(content.routines, "test");
    expect(again.diagnostics).toEqual([]);
    expect(again.items).toEqual(content.routines);
  });
});

describe("round-trip", () => {
  test("portableFromIr(irFromPortable(x)).content equals x modulo local fields", () => {
    const x: PortableContent = {
      claudeMd: "# Role\nAll the instructions.",
      skills: [
        { slug: "alpha", body: "---\ntitle: Alpha\n---\nalpha body" },
        { slug: "beta", body: "---\ntitle: Beta\n---\nbeta body" },
      ],
      routines: [routine],
      learnings: [
        { id: "L1", text: "one", created_at: "2026-01-01T00:00:00.000Z" },
        { id: "L2", text: "two", created_at: "2026-01-02T00:00:00.000Z" },
      ],
    };
    const { content } = portableFromIr(irFromPortable(x, baseOpts));
    // The timestamps are the INSTALL's, not the source's — everything else
    // about the routine round-trips unchanged.
    expect(content).toEqual({
      ...x,
      routines: [
        {
          ...routine,
          created_at: content.routines[0]?.created_at ?? "",
          updated_at: content.routines[0]?.updated_at ?? "",
        },
      ],
    });
  });

  test("round-trips content with no CLAUDE.md and no learnings", () => {
    const x: PortableContent = {
      skills: [{ slug: "solo", body: "---\ntitle: Solo\n---\nsolo body" }],
      routines: [],
      learnings: [],
    };
    const { content } = portableFromIr(irFromPortable(x, baseOpts));
    expect(content).toEqual({ ...x, routines: [] });
  });
});

describe("storePackageFromIrPayload", () => {
  const ir = irFromPortable(
    {
      claudeMd: "# Role\nYou sell things.",
      skills: [{ slug: "research", body: "---\ntitle: Research\n---\nbody" }],
      routines: [],
      learnings: [],
    },
    baseOpts,
  );

  test("unwraps the gateway's {agent, ir} envelope into a package", () => {
    const pkg = storePackageFromIrPayload(
      { agent: { slug: "x" }, ir },
      "9.9.9",
    );
    if ("error" in pkg) throw new Error(pkg.error);
    expect(pkg.manifest.agentName).toBe("Sales Copilot");
    expect(pkg.manifest.description).toBe("Handles inbound sales.");
    expect(pkg.manifest.exporter).toBe("Dana");
    expect(pkg.manifest.houstonVersion).toBe("9.9.9");
    expect(pkg.manifest.anonymized).toBe(false);
    expect(pkg.content.claudeMd).toBe("# Role\nYou sell things.");
    expect(pkg.content.skills).toEqual([
      { slug: "research", body: "---\ntitle: Research\n---\nbody" },
    ]);
  });

  test("carries routines into the installable package", () => {
    const withRoutines = irFromPortable(
      { skills: [], routines: allThree, learnings: [] },
      baseOpts,
    );
    const pkg = storePackageFromIrPayload({ ir: withRoutines }, "9.9.9");
    if ("error" in pkg) throw new Error(pkg.error);
    expect(pkg.content.routines.map((r) => r.name)).toEqual([
      "Daily",
      "New mail",
      "External ping",
    ]);
  });

  test("accepts a bare IR payload", () => {
    const pkg = storePackageFromIrPayload(ir, "1.0.0");
    expect("error" in pkg).toBe(false);
  });

  test("an unreadable IR surfaces the user-facing error, no throw", () => {
    expect(storePackageFromIrPayload({ ir: { nope: true } }, "1.0.0")).toEqual({
      error: "The shared agent could not be read (unexpected format).",
    });
  });
});
