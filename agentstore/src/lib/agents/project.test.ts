import { type AgentIR, agentIrSchema } from "@houston/agentstore-contract";
import { describe, expect, it } from "vitest";
import { projectIdentityColumns } from "./project";

function makeIr(overrides: Partial<AgentIR["identity"]> = {}): AgentIR {
  return agentIrSchema.parse({
    irVersion: "2.0.0",
    identity: {
      slug: "helper",
      name: "Helper",
      description: "A helper.",
      category: "productivity",
      tags: ["a", "b"],
      creator: { displayName: "Dana", url: "https://dana.example" },
      ...overrides,
    },
    instructions: "",
    integrations: ["GMAIL", "SLACK"],
    provenance: { createdVia: "agent-post" },
  });
}

describe("projectIdentityColumns", () => {
  it("flattens an emoji icon", () => {
    const cols = projectIdentityColumns(
      makeIr({ icon: { kind: "emoji", value: "🤖" } }),
    );
    expect(cols.iconKind).toBe("emoji");
    expect(cols.iconValue).toBe("🤖");
    expect(cols.tags).toEqual(["a", "b"]);
    expect(cols.integrations).toEqual(["GMAIL", "SLACK"]);
    expect(cols.creatorUrl).toBe("https://dana.example");
  });

  it("flattens a url icon", () => {
    const cols = projectIdentityColumns(
      makeIr({ icon: { kind: "url", url: "https://img.example/a.png" } }),
    );
    expect(cols.iconKind).toBe("url");
    expect(cols.iconValue).toBe("https://img.example/a.png");
  });

  it("nulls an absent icon, tagline, and creator url", () => {
    const cols = projectIdentityColumns(
      makeIr({ creator: { displayName: "X" } }),
    );
    expect(cols.iconKind).toBeNull();
    expect(cols.iconValue).toBeNull();
    expect(cols.tagline).toBeNull();
    expect(cols.creatorUrl).toBeNull();
  });
});
