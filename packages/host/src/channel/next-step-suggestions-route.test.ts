import { afterAll, beforeAll, expect, test } from "vitest";
import {
  auth,
  startAccountServer,
  store,
  vfs,
} from "../../tests/account-fixture";
import { nextStepSuggestionsReader } from "./next-step-suggestions";

let base = "";
let close: () => Promise<void>;
beforeAll(async () => {
  ({ base, close } = await startAccountServer());
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
