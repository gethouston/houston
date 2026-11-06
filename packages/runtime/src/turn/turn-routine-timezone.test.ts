import { expect, test } from "vitest";
import {
  agentStore,
  claimedTurn,
  podDocs,
  routine,
  storedRoutines,
} from "./turn-views.test-support";

test.each([
  "CRON_TZ=America/New_York",
  "TZ=America/New_York",
])("pooled create and update refuse %s with the planner zone", async (prefix) => {
  const agent = await agentStore([routine("r1", "Morning")]);
  const turn = await claimedTurn(agent, podDocs(), "c1", {
    timezone: "America/Bogota",
  });
  const original = await storedRoutines(agent);
  for (const input of [{ name: "Morning", prompt: "Check it" }, { id: "r1" }]) {
    const response = await turn.writeRoute("/sandbox/routines/save", {
      ...input,
      schedule: `${prefix} 0 9 * * *`,
    });
    expect(response?.status).toBe(400);
    expect(await response?.json()).toEqual({
      error:
        "invalid schedule: Leave the time zone out of the schedule: routines run in America/Bogota. Write the cron in that local time.",
    });
    expect(await storedRoutines(agent)).toEqual(original);
  }
});
