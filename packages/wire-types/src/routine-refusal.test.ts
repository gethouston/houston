import {
  ROUTINE_NOT_FOUND as protocolCode,
  isRoutineNotFoundBody as protocolParse,
} from "@houston/protocol/routine-refusal";
import { expect, test } from "vitest";
import { isRoutineNotFoundBody, ROUTINE_NOT_FOUND } from "./routine-refusal";

test("the wire contract re-exports the protocol's one parser", () => {
  expect(isRoutineNotFoundBody).toBe(protocolParse);
  expect(ROUTINE_NOT_FOUND).toBe(protocolCode);
  expect(ROUTINE_NOT_FOUND).toBe("routine_not_found");
});
