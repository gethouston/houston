import { ok, strictEqual } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
// Import the sentinel module directly (not the @houston-ai/core barrel): the
// barrel's extension-less sibling imports don't resolve under bare node:test.
import {
  PROVIDER_CONNECT_TIMEOUT_ERROR,
  PROVIDER_LOGIN_PORT_BUSY_ERROR,
  PROVIDER_LOGIN_TIMEOUT_ERROR,
} from "../../ui/core/src/provider-login.ts";

// The engine adapter reports login failures as stable English sentinel strings
// (`@houston-ai/core`), and `app/src/lib/provider-login-error.ts` localizes
// them by VALUE match. Two things must hold or a user sees the wrong text:
// every sentinel keeps a mapping line in the app module, and every mapped
// toast key exists in all three locales (else i18next renders the bare key).
const LOCALES = ["en", "es", "pt"] as const;
const SENTINEL_TO_KEY: Record<string, string> = {
  [PROVIDER_CONNECT_TIMEOUT_ERROR]: "connectTimedOut",
  [PROVIDER_LOGIN_TIMEOUT_ERROR]: "loginTimedOut",
  [PROVIDER_LOGIN_PORT_BUSY_ERROR]: "signInPortBusy",
};

describe("provider login error sentinels", () => {
  const source = readFileSync(
    join(import.meta.dirname, "../src/lib/provider-login-error.ts"),
    "utf8",
  );

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
