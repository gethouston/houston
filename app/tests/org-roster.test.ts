import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { OrgMember } from "@houston-ai/engine-client";
import {
  agentLabel,
  memberLabel,
  shortenId,
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
  it("memberLabel prefers email, falls back to a short id", () => {
    strictEqual(memberLabel("u1", members), "maria@acme.com");
    strictEqual(memberLabel("u2", members), "u2");
    strictEqual(memberLabel("aaaaaaaabbbbbbbb", members), "aaaaaaaa");
    strictEqual(memberLabel("u3", undefined), "u3");
  });

  it("agentLabel resolves by slug (folderPath) or id, else humanizes", () => {
    strictEqual(agentLabel("sales-agent", agents), "Sales Agent");
    strictEqual(agentLabel("id-2", agents), "Support");
    strictEqual(agentLabel("legal_bot", agents), "Legal bot");
    strictEqual(agentLabel(undefined, agents), "");
  });

  it("shortenId keeps short ids intact", () => {
    strictEqual(shortenId("short"), "short");
    strictEqual(shortenId("aaaaaaaabbbbbbbb"), "aaaaaaaa");
    strictEqual(shortenId(""), "");
  });
});
