import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { Capabilities, OrgRole } from "@houston-ai/engine-client";
import { isConfigReadOnly } from "../src/components/tabs/job-description-access.ts";

const caps = (over: Partial<Capabilities> = {}): Capabilities => ({
  profile: "cloud",
  revealInOs: false,
  terminal: false,
  tunnel: false,
  codeExecution: "remote-sandbox",
  providers: [],
  openaiCompatible: false,
  integrations: [],
  ...over,
});

const multiplayer = (role: OrgRole): Capabilities =>
  caps({ multiplayer: true, role });

type AgentAccess = "manager" | "user";

describe("job description access — isConfigReadOnly (matrix v2)", () => {
  it("single-player is NEVER read-only (zero visual change from today)", () => {
    // The whole point: self-host / local sidecar keeps every affordance.
    for (const access of ["manager", "user", undefined] as const) {
      strictEqual(isConfigReadOnly(caps(), { access }), false);
      strictEqual(isConfigReadOnly(null, { access }), false);
    }
  });

  it("multiplayer owner edits every agent", () => {
    strictEqual(
      isConfigReadOnly(multiplayer("owner"), { access: "user" }),
      false,
    );
    strictEqual(
      isConfigReadOnly(multiplayer("owner"), { access: undefined }),
      false,
    );
  });

  it("agent-manager (access='manager') edits; everyone else is read-only", () => {
    for (const role of ["admin", "user"] as const) {
      strictEqual(
        isConfigReadOnly(multiplayer(role), { access: "manager" }),
        false,
      );
      strictEqual(
        isConfigReadOnly(multiplayer(role), { access: "user" }),
        true,
      );
      strictEqual(
        isConfigReadOnly(multiplayer(role), { access: undefined }),
        true,
      );
    }
  });

  it("exhaustive role x access matrix mirrors the manager gate", () => {
    const roles: readonly OrgRole[] = ["owner", "admin", "user"];
    const accesses: readonly (AgentAccess | undefined)[] = [
      "manager",
      "user",
      undefined,
    ];
    const readOnly = (role: OrgRole, access?: AgentAccess): boolean =>
      !(role === "owner" || access === "manager");
    for (const role of roles) {
      for (const access of accesses) {
        strictEqual(
          isConfigReadOnly(multiplayer(role), { access }),
          readOnly(role, access),
          `role=${role} access=${access}`,
        );
      }
    }
  });
});
