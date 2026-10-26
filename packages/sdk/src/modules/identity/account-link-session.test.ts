import { describe, expect, it } from "vitest";
import { deferredLink, GOOD_CODE, identityKit } from "./test-kit";

/** A link held in flight on the session the code minted, `uid-a`. */
async function linkInFlight() {
  const kit = identityKit();
  const link = deferredLink();
  kit.linkAnswers(link.attempt);
  await kit.identity.beginAccountLink(
    kit.pending("microsoft.com", "p@example.com"),
  );
  const verifying = kit.identity.verifyAccountLinkCode(GOOD_CODE);
  await link.inFlight;
  const succeed = () =>
    link.settle((session) => ({
      kind: "linked",
      session: { ...session, label: "linked" },
    }));
  return { kit, verifying, succeed };
}

describe("the platform session changing under a link", () => {
  it.each([
    ["signs out in another tab", null],
    ["signs in as someone else in another tab", "uid-b"],
  ])("ends the link when the person %s, so its success restores nothing", async (_, uid) => {
    const { kit, verifying, succeed } = await linkInFlight();
    kit.identity.sessionChanged(uid);
    succeed();
    expect(await verifying).toEqual({ kind: "not_waiting" });
    expect(kit.calls.established).toEqual([]);
    expect(kit.calls.signedOut).toEqual([]);
    expect(kit.identity.getAccountLink()).toEqual({ status: "idle" });
  });

  it("keeps the link through the minted session's own token changes", async () => {
    const { kit, verifying, succeed } = await linkInFlight();
    kit.identity.sessionChanged("uid-a");
    succeed();
    expect(await verifying).toEqual({ kind: "linked" });
    expect(kit.calls.established.map((e) => e.method)).toEqual([
      "microsoft.com",
    ]);
  });

  it("ignores the signed-out platform before the code mints a session", async () => {
    const kit = identityKit();
    await kit.identity.beginAccountLink(
      kit.pending("google.com", "p@example.com"),
    );
    kit.identity.sessionChanged(null);
    expect(kit.identity.getAccountLink().status).toBe("needs_code");
    expect(await kit.identity.verifyAccountLinkCode(GOOD_CODE)).toEqual({
      kind: "linked",
    });
  });
});
