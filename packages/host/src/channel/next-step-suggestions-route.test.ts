import type { HoustonEvent } from "@houston/protocol";
import { afterAll, beforeAll, expect, test } from "vitest";
import {
  auth,
  startAccountServer,
  store,
  vfs,
} from "../../tests/account-fixture";
import type { EventHub } from "../events/hub";
import { nextStepSuggestionsReader } from "./next-step-suggestions";

const emitted: { userId: string; event: HoustonEvent }[] = [];
const events: EventHub = {
  emit: (userId, event) => emitted.push({ userId, event }),
  subscribe: () => () => {},
};

let base = "";
let close: () => Promise<void>;
beforeAll(async () => {
  ({ base, close } = await startAccountServer({ events }));
});
afterAll(async () => close());

const put = (value: string) =>
  fetch(`${base}/v1/preferences/next_step_suggestions`, {
    method: "PUT",
    headers: auth("hana"),
    body: JSON.stringify({ value }),
  });

test("the setting saved through the preference route is the one every turn reads", async () => {
  const read = nextStepSuggestionsReader(vfs, store, "hana");
  expect(await read()).toBe(true);
  expect((await put("false")).status).toBe(200);
  expect(await read()).toBe(false);
  expect((await put("true")).status).toBe(200);
  expect(await read()).toBe(true);
});

test("a saved preference tells the person's open apps to re-read it", async () => {
  emitted.length = 0;
  expect((await put("false")).status).toBe(200);
  const ws = await store.getOrCreatePersonalWorkspace("hana");
  expect(emitted).toEqual([
    {
      userId: "hana",
      event: { type: "PreferencesChanged", workspaceId: ws.id },
    },
  ]);
});
