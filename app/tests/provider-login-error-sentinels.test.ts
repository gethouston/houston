import { ok, strictEqual } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  PROVIDER_CONNECT_TIMEOUT_ERROR,
  PROVIDER_COPILOT_NO_ACCESS_ERROR,
  PROVIDER_LOGIN_PORT_BUSY_ERROR,
  PROVIDER_LOGIN_TIMEOUT_ERROR,
} from "../../ui/core/src/provider-login.ts";

const LOCALES = ["en", "es", "pt"] as const;
const SENTINEL_TO_KEY: Record<string, string> = {
  [PROVIDER_CONNECT_TIMEOUT_ERROR]: "connectTimedOut",
  [PROVIDER_LOGIN_TIMEOUT_ERROR]: "loginTimedOut",
  [PROVIDER_LOGIN_PORT_BUSY_ERROR]: "signInPortBusy",
  [PROVIDER_COPILOT_NO_ACCESS_ERROR]: "copilotNoAccess",
};

describe("provider login error sentinels", () => {
  const source = readFileSync(
    join(import.meta.dirname, "../src/lib/provider-login-error.ts"),
    "utf8",
  );

  it("the runtime mirrors the Copilot no-access sentinel by value", () => {
    const runtime = readFileSync(
      join(
        import.meta.dirname,
        "../../packages/runtime/src/auth/login-state.ts",
      ),
      "utf8",
    );
    ok(
      runtime.includes(JSON.stringify(PROVIDER_COPILOT_NO_ACCESS_ERROR)),
      "packages/runtime/src/auth/login-state.ts must define the exact sentinel string",
    );
    ok(
      /export function loginFailureMessage[\s\S]*?return COPILOT_NO_ACCESS_ERROR;/.test(
        runtime,
      ),
      "loginFailureMessage must emit COPILOT_NO_ACCESS_ERROR",
    );
  });

  for (const [sentinel, key] of Object.entries(SENTINEL_TO_KEY)) {
    it(`maps the "${key}" sentinel in provider-login-error.ts`, () => {
      ok(
        source.includes(`providers:toast.${key}`),
        `provider-login-error.ts must localize to providers:toast.${key}`,
      );
      ok(sentinel.length > 0);
    });

    for (const locale of LOCALES) {
      it(`${locale} has a usable providers:toast.${key}`, () => {
        const providers = JSON.parse(
          readFileSync(
            join(
              import.meta.dirname,
              `../src/locales/${locale}/providers.json`,
            ),
            "utf8",
          ),
        ) as { toast?: Record<string, unknown> };
        const value = providers.toast?.[key];
        strictEqual(typeof value, "string");
        const text = value as string;
        ok(text.length > 0, "must not be empty");
        ok(!text.includes("—"), "no em dashes in user-facing copy");
      });
    }
  }
});
