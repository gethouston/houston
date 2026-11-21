import { FAKE_HOST_URL } from "@houston/fake-host";
import { expect, test } from "./support/fixtures";

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
