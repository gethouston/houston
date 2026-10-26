import { deepStrictEqual, strictEqual } from "node:assert/strict";
import { registerHooks } from "node:module";
import { afterEach, before, beforeEach, describe, it } from "node:test";
import { pathToFileURL } from "node:url";
import type { LinkAttempt, PendingLinkHandle } from "@houston/sdk/identity";
import type { Session } from "../src/lib/identity/session.ts";

// Firebase shares one session across a browser's tabs: another tab's sign-out
// reaches this one only through Firebase's observers, never through this
// tab's sign-out. The real binding and SDK run against a fake Firebase.
const world = {
  uid: null as string | null,
  observers: [] as ((session: Session | null) => void)[],
  linkStarted: () => {},
  settleLink: (_: LinkAttempt<Session>) => {},
  established: [] as string[],
  signOuts: 0,
};
Object.assign(globalThis, { __crossTab: world });

const src = (path: string) =>
  pathToFileURL(new URL(path, import.meta.url).pathname).href;
const w = "globalThis.__crossTab";
const STUBS: Record<string, string> = {
  "@houston/engine-adapter": `export { createIdentityClient } from ${JSON.stringify(src("../../packages/engine-adapter/src/identity.ts"))};`,
  "./auth-gateway": "export const gatewayUrl = () => 'https://gw.test';",
  "./error-toast":
    "export const showErrorToast = () => false; export const showExpectedStateToast = () => {};",
  "./quiet-error-report": "export const reportQuietError = () => {};",
  "./i18n": "export default { t: (k) => k };",
  "./identity": `export * from ${JSON.stringify(src("../src/lib/identity/errors.ts"))};`,
  "./identity/desktop-link":
    "export const desktopLinkPending = () => {}; export const discardDesktopCredential = () => {};",
  "./identity/desktop-signin":
    "export const customTokenDesktopSession = () => {};",
  "./os-bridge": "export const osIsTauri = () => false;",
  "./sign-in-establish": `export const establishDesktopSession = async () => {}; export const establishWebSession = (o) => ${w}.established.push(o.session.uid);`,
  "./sign-out": `export const signOut = async () => { ${w}.signOuts++; };`,
  "./web-identity": `const web = {
    webCurrentUid: () => ${w}.uid,
    webOnIdTokenChanged: (cb) => (${w}.observers.push(cb), () => {}),
    webSignInWithCustomToken: async () => (${w}.signIn(), { session: ${w}.session, isNewUser: false }),
    webLinkPending: (handle, session) => ${w}.link(session),
    webDiscardPending: () => {},
  };
  export const webIdentity = async () => web;
  export const loadedWebIdentity = () => web;`,
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

const claims = Buffer.from('{"email":"p@example.com"}').toString("base64url");
const SESSION = { uid: "uid-a", idToken: `e30.${claims}.` } as Session;
const emit = () => {
  for (const cb of world.observers) cb(world.uid ? SESSION : null);
};
Object.assign(world, {
  session: SESSION,
  signIn: () => {
    world.uid = SESSION.uid;
    emit();
  },
  link: () =>
    new Promise<LinkAttempt<Session>>((resolve) => {
      world.settleLink = resolve;
      world.linkStarted();
    }),
});

let identityClient: typeof import("../src/lib/account-link.ts").identityClient;
before(async () => {
  ({ identityClient } = await import("../src/lib/account-link.ts"));
});
const realFetch = globalThis.fetch;

/** Begin a Microsoft link and hold its request in flight. */
async function linkInFlight() {
  const started = new Promise<void>((resolve) => {
    world.linkStarted = resolve;
  });
  await identityClient.beginAccountLink({
    kind: "link_required",
    provider: "microsoft.com",
    email: "p@example.com",
    handle: "handle-1" as PendingLinkHandle,
    accountId: "uid-a",
  });
  const verifying = identityClient.verifyAccountLinkCode("123456");
  await Promise.race([
    started,
    verifying.then((o) => {
      throw new Error(`settled before linking: ${JSON.stringify(o)}`);
    }),
  ]);
  return { verifying };
}
const linked = () =>
  world.settleLink({ kind: "linked", session: { ...SESSION } });

beforeEach(() => {
  Object.assign(world, { uid: null, established: [], signOuts: 0 });
  globalThis.fetch = async (url) =>
    String(url).endsWith("/start")
      ? new Response(null, { status: 204 })
      : Response.json({ customToken: "ct" });
});
afterEach(() => {
  globalThis.fetch = realFetch;
  identityClient.cancelAccountLink();
});

describe("a sign-out in another tab while a link is in flight", () => {
  it("ends the link, so its late success never signs this tab back in", async () => {
    const { verifying } = await linkInFlight();
    world.uid = null;
    emit();
    linked();
    deepStrictEqual(await verifying, { kind: "not_waiting" });
    deepStrictEqual(world.established, []);
    strictEqual(world.signOuts, 0, "this tab's sign-out never ran");
    deepStrictEqual(identityClient.getAccountLink(), { status: "idle" });
  });

  it("caches nothing when Firebase lost the session before telling its observers", async () => {
    const { verifying } = await linkInFlight();
    world.uid = null;
    linked();
    strictEqual((await verifying).kind, "refused");
    deepStrictEqual(world.established, []);
    strictEqual(world.signOuts, 0, "nobody is left to sign out");
  });

  it("still establishes a link Firebase holds", async () => {
    const { verifying } = await linkInFlight();
    linked();
    deepStrictEqual(await verifying, { kind: "linked" });
    deepStrictEqual(world.established, ["uid-a"]);
  });
});
