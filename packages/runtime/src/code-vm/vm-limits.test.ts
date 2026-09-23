import { expect, test } from "vitest";
import {
  DEFAULT_LIMITS,
  LANGUAGES as SANDBOX_LANGUAGES,
} from "../../../code-sandbox/src/types";
import { LANGUAGES, VM_LIMITS } from "./types";

// The VM executor answers with the Cloud Run sandbox's contract, so the tool
// and its prompt cannot tell the two apart. The runtime image does not ship
// packages/code-sandbox, hence two copies, held equal here.
test("the VM keeps the Cloud Run sandbox's limits and languages", () => {
  expect(VM_LIMITS).toEqual(DEFAULT_LIMITS);
  expect(LANGUAGES).toEqual(SANDBOX_LANGUAGES);
});
