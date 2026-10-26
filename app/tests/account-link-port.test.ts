import { deepStrictEqual, rejects, strictEqual } from "node:assert/strict";
import { registerHooks } from "node:module";
import { before, beforeEach, describe, it } from "node:test";
import { pathToFileURL } from "node:url";
import type { AccountLinkPort } from "@houston/sdk/identity";
import { IdentityError } from "../src/lib/identity/errors.ts";
import type { Session } from "../src/lib/identity/session.ts";

// The binding's neighbours read `import.meta.env` or render, so the node
// runner stubs them and each stub records into `world`.
interface World {
  port?: AccountLinkPort<Session>;
  tauri: boolean;
  exchange: () => Promise<unknown>;
  currentUid: string | null;
  signOuts: number;
  quiet: unknown[][];
  errors: unknown[][];
}
const world: World = {
  tauri: true,
  exchange: async () => ({}),
  currentUid: null,
  signOuts: 0,
  quiet: [],
  errors: [],
};
Object.assign(globalThis, { __linkWorld: world });

const errorsUrl = pathToFileURL(
  new URL("../src/lib/identity/errors.ts", import.meta.url).pathname,
).href;
const w = "globalThis.__linkWorld";
const STUBS: Record<string, string> = {
  "@houston/engine-adapter": `export const createIdentityClient = (o) => (${w}.port = o.port, {});`,
  "./auth-gateway": "export const gatewayUrl = () => 'https://gw.test';",
  "./error-toast": `export const showErrorToast = (...a) => (${w}.errors.push(a), false); export const showExpectedStateToast = () => {};`,
  "./quiet-error-report": `export const reportQuietError = (...a) => ${w}.quiet.push(a);`,
  "./i18n": "export default { t: (k) => k };",
  "./identity": `export * from ${JSON.stringify(errorsUrl)};`,
  "./identity/desktop-link":
    "export const desktopLinkPending = () => {}; export const discardDesktopCredential = () => {};",
  "./identity/desktop-signin": `export const customTokenDesktopSession = () => ${w}.exchange();`,
  "./os-bridge": `export const osIsTauri = () => ${w}.tauri;`,
  "./sign-in-establish":
    "export const establishDesktopSession = async () => {}; export const establishWebSession = () => {};",
  "./sign-out": `export const signOut = async () => { ${w}.signOuts++; };`,
  "./web-identity": `const web = { webCurrentUid: () => ${w}.currentUid, webSignInWithCustomToken: () => ${w}.exchange() }; export const webIdentity = async () => web; export const loadedWebIdentity = () => web;`,
};
registerHooks({
  resolve(specifier, context, next) {
    const stub = context.parentURL?.endsWith("/lib/account-link.ts")
      ? STUBS[specifier]
      : undefined;
    if (stub === undefined) return next(specifier, context);
    return {
      url: `data:text/javascript,${encodeURIComponent(stub)}`,
      shortCircuit: true,
    };
  },
});

let port: AccountLinkPort<Session>;
before(async () => {
  await import("../src/lib/account-link.ts");
  if (!world.port) throw new Error("the binding never built its client");
  port = world.port;
});
beforeEach(() => {
  Object.assign(world, { tauri: true, currentUid: null, signOuts: 0 });
  world.quiet = [];
  world.errors = [];
});

const SESSION = { uid: "uid-a", idToken: "t" } as Session;

describe("account-link binding", () => {
  it("hands the SDK an unreachable Identity Platform as its offline state", async () => {
    for (const tauri of [true, false]) {
      world.tauri = tauri;
      world.exchange = async () => {
        throw new IdentityError("network");
      };
      await rejects(port.signInWithCustomToken("ct"), {
        name: "EmailOtpError",
        code: "network",
      });
    }
  });

  it("hands it a disabled account as the gateway's refusal, and anything else as is", async () => {
    world.exchange = async () => {
      throw new IdentityError("user_disabled");
    };
    await rejects(port.signInWithCustomToken("ct"), {
      name: "EmailOtpError",
      code: "otp_account_disabled",
    });
    const config = new IdentityError("invalid_custom_token");
    world.exchange = async () => {
      throw config;
    };
    await rejects(port.signInWithCustomToken("ct"), (e) => e === config);
  });

  it("passes on whether the exchange created the account", async () => {
    world.exchange = async () => ({ session: SESSION, isNewUser: true });
    deepStrictEqual(await port.signInWithCustomToken("ct"), {
      session: SESSION,
      isNewUser: true,
    });
  });

  it("counts offline quietly and sends the unexpected to the report-only path", () => {
    const drop = new TypeError("Failed to fetch");
    port.report({ quiet: "offline", reason: "email_code_failed", cause: drop });
    const bug = new Error("INVALID_IDP_RESPONSE");
    port.report({ quiet: null, reason: "link_failed", cause: bug });
    deepStrictEqual(
      world.quiet.map(([kind, command, , cause]) => [kind, command, cause]),
      [["offline", "account_link_email_code_failed", drop]],
    );
    deepStrictEqual(
      world.errors.map(([command, , cause]) => [command, cause]),
      [["account_link_link_failed", bug]],
    );
  });

  it("signs out only the web session the flow minted", async () => {
    world.tauri = false;
    world.currentUid = "uid-someone-else";
    await port.signOutProvisional(SESSION);
    strictEqual(world.signOuts, 0, "a session that replaced it stays");
    world.currentUid = null;
    await port.signOutProvisional(SESSION);
    strictEqual(world.signOuts, 0, "nothing to end once signed out");
    world.currentUid = "uid-a";
    await port.signOutProvisional(SESSION);
    strictEqual(world.signOuts, 1);
    world.tauri = true;
    await port.signOutProvisional(SESSION);
    strictEqual(world.signOuts, 1, "desktop never published it");
  });
});
