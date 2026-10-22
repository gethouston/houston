import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { OrgMember } from "@houston/engine-adapter";
import {
  agentLabel,
  memberLabel,
} from "../src/components/organization/org-roster.ts";

const members: OrgMember[] = [
  { userId: "u1", email: "maria@acme.com", role: "owner" },
  { userId: "u2", role: "user" },
];

const agents = [
  { id: "id-1", name: "Sales Agent", folderPath: "sales-agent" },
  { id: "id-2", name: "Support", folderPath: "support" },
];

describe("org roster resolvers", () => {
  const labels = { unnamedAccount: "Unnamed", formerMember: "Former" };

  it("memberLabel names a member, never by their id", () => {
    strictEqual(memberLabel("u1", members, labels), "maria@acme.com");
    strictEqual(memberLabel("u2", members, labels), "Unnamed");
    strictEqual(memberLabel("aaaaaaaabbbbbbbb", members, labels), "Former");
    strictEqual(memberLabel("u3", undefined, labels), "Former");
  });

  it("memberLabel prefers the display name over the email", () => {
    const named: OrgMember[] = [
      { userId: "u4", displayName: "Ana", email: "ana@acme.com", role: "user" },
    ];
    strictEqual(memberLabel("u4", named, labels), "Ana");
  });

  it("agentLabel resolves by slug (folderPath) or id, else humanizes", () => {
    strictEqual(agentLabel("sales-agent", agents), "Sales Agent");
    strictEqual(agentLabel("id-2", agents), "Support");
    strictEqual(agentLabel("legal_bot", agents), "Legal bot");
    strictEqual(agentLabel(undefined, agents), "");
  });
});
