import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { Capabilities, OrgsList } from "@houston/engine-adapter";
import {
  perfSpanEventProps,
  perfSpanNeedsMemberships,
  perfSpanOrgSlug,
} from "../src/lib/perf-span-mirror.ts";
import { PERSONAL_WORKSPACE_ID } from "../src/lib/space-id.ts";
import { TRACKED_ALLOWED_PROPS } from "./fixtures/analytics-source.ts";

const BASE: Capabilities = {
  profile: "local",
  revealInOs: true,
  terminal: true,
  tunnel: false,
  codeExecution: "local-bash",
  providers: [],
  openaiCompatible: true,
  integrations: [],
  sharedSkills: true,
};
const DESKTOP: Capabilities = BASE;
const SELF_HOST: Capabilities = { ...BASE, profile: "cloud" };
const GATEWAY: Capabilities = { ...BASE, profile: "cloud", spaces: true };

const MEMBERSHIPS: OrgsList = {
  orgs: [
    {
      id: "o1",
      slug: "383369a239383fee",
      name: "Personal",
      kind: "personal",
      role: "owner",
      memberCount: 1,
      degraded: false,
    },
  ],
  invites: [],
};

describe("perfSpanOrgSlug", () => {
  it("is the pinned team's slug in a hosted team space", () => {
    strictEqual(
      perfSpanOrgSlug(GATEWAY, "org:5f2b225f316c6079", undefined),
      "5f2b225f316c6079",
    );
  });

  it("is the personal membership's slug in the hosted personal space", () => {
    strictEqual(
      perfSpanOrgSlug(GATEWAY, PERSONAL_WORKSPACE_ID, MEMBERSHIPS),
      "383369a239383fee",
    );
  });

  it("is null while the hosted memberships are unread", () => {
    strictEqual(
      perfSpanOrgSlug(GATEWAY, PERSONAL_WORKSPACE_ID, undefined),
      null,
    );
  });

  it("is null on desktop, even with memberships cached from a hosted session", () => {
    strictEqual(
      perfSpanOrgSlug(DESKTOP, PERSONAL_WORKSPACE_ID, MEMBERSHIPS),
      null,
    );
  });

  it("is null on self-host", () => {
    strictEqual(
      perfSpanOrgSlug(SELF_HOST, PERSONAL_WORKSPACE_ID, MEMBERSHIPS),
      null,
    );
  });

  it("is null off the gateway even for a local workspace named like a team", () => {
    strictEqual(
      perfSpanOrgSlug(DESKTOP, "org:5f2b225f316c6079", undefined),
      null,
    );
    strictEqual(
      perfSpanOrgSlug(SELF_HOST, "org:5f2b225f316c6079", undefined),
      null,
    );
  });

  it("is null until capabilities say spaces exist", () => {
    strictEqual(perfSpanOrgSlug(null, "org:5f2b225f316c6079", undefined), null);
    strictEqual(
      perfSpanOrgSlug(null, PERSONAL_WORKSPACE_ID, MEMBERSHIPS),
      null,
    );
  });
});

describe("perfSpanNeedsMemberships", () => {
  it("reads memberships only for a settled hosted personal space", () => {
    strictEqual(perfSpanNeedsMemberships(GATEWAY, PERSONAL_WORKSPACE_ID), true);
  });

  it("skips the read in a team space, before the space settles, and off the gateway", () => {
    strictEqual(
      perfSpanNeedsMemberships(GATEWAY, "org:5f2b225f316c6079"),
      false,
    );
    strictEqual(perfSpanNeedsMemberships(GATEWAY, undefined), false);
    strictEqual(
      perfSpanNeedsMemberships(DESKTOP, PERSONAL_WORKSPACE_ID),
      false,
    );
    strictEqual(perfSpanNeedsMemberships(null, PERSONAL_WORKSPACE_ID), false);
  });
});

describe("perfSpanEventProps", () => {
  it("carries the org slug and the outcome when the span has them", () => {
    deepStrictEqual(
      perfSpanEventProps("send_to_first_response", 800, {
        orgSlug: "5f2b225f316c6079",
        outcome: "first_text",
      }),
      {
        span: "send_to_first_response",
        duration_ms: 800,
        org_slug: "5f2b225f316c6079",
        outcome: "first_text",
      },
    );
  });

  it("carries a failed send's outcome so the canary can count it", () => {
    deepStrictEqual(
      perfSpanEventProps("send_to_first_response", 4_000, {
        orgSlug: null,
        outcome: "error",
      }),
      { span: "send_to_first_response", duration_ms: 4_000, outcome: "error" },
    );
  });

  it("leaves org_slug and outcome out entirely when there are none", () => {
    const props = perfSpanEventProps("app_to_board", 800, { orgSlug: null });
    deepStrictEqual(props, { span: "app_to_board", duration_ms: 800 });
    ok(!("org_slug" in props), "org_slug must be absent, not empty");
    ok(!("outcome" in props), "outcome must be absent, not empty");
  });

  it("carries both board tags on app_to_board, false ones included", () => {
    deepStrictEqual(
      perfSpanEventProps("app_to_board", 800, {
        orgSlug: null,
        board: { firstRun: false, wasHidden: false },
      }),
      {
        span: "app_to_board",
        duration_ms: 800,
        first_run: false,
        was_hidden: false,
      },
    );
  });

  it("only sends properties the analytics allow-list keeps", () => {
    const props = {
      ...perfSpanEventProps("send_to_first_response", 5, {
        orgSlug: "5f2b225f316c6079",
        outcome: "timeout",
      }),
      ...perfSpanEventProps("app_to_board", 5, {
        orgSlug: null,
        board: { firstRun: true, wasHidden: true },
      }),
    };
    for (const key of Object.keys(props)) {
      ok(TRACKED_ALLOWED_PROPS.has(key), `cleanProps would drop "${key}"`);
    }
  });
});
