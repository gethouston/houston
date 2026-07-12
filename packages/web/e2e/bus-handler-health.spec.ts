import { FAKE_HOST_URL } from "@houston/fake-host";
import { expect, test } from "./support/fixtures";

/**
 * Event-bus handler health: firing every common global event type must not
 * make any subscribed handler throw. The engine-adapter bus CATCHES handler
 * throws (one bad subscriber must not starve the rest), which also means a
 * throwing handler fails silently in production — its invalidation/analytics/
 * notification work just stops. This guard turns that silence into a red test.
 *
 * (Born from a live incident: a recurring "Can only call Window.setTimeout on
 * instances of Window" TypeError in a desktop dev session, caught and eaten by
 * the bus on every event. The bus now logs the stack when it happens — see
 * engine-adapter/bus.ts — and this spec keeps the common event paths clean.)
 */
test("global events do not make any bus handler throw", async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.stack ?? err}`));

  await page.goto("/");
  await page.waitForTimeout(1500);

  for (const type of [
    "FilesChanged",
    "ActivityChanged",
    "ConversationsChanged",
    "RoutinesChanged",
    "RoutineRunsChanged",
    "SkillsChanged",
    "LearningsChanged",
    "ConfigChanged",
    "WorkspacesChanged",
    "CustomIntegrationsChanged",
  ]) {
    await request.post(`${FAKE_HOST_URL}/__test__/emit`, {
      data: { type, agentPath: "Personal/Seed Agent" },
    });
    await page.waitForTimeout(200);
  }
  await page.waitForTimeout(1000);

  const thrown = errors.filter((e) => /handler threw/i.test(e));
  for (const e of thrown) console.log("CAPTURED:", e);
  expect(thrown).toEqual([]);
});
