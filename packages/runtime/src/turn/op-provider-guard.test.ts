import { expect, test } from "vitest";
import {
  assertWorkerOpProvider,
  WorkerOpDeclinedError,
} from "./op-provider-guard";

test("worker one-shot ops decline instead of sending anthropic through pi", () => {
  expect(() => assertWorkerOpProvider("anthropic")).toThrow(
    WorkerOpDeclinedError,
  );
});

test.each([
  "openai-codex",
  "google",
  "groq",
])("worker one-shot ops admit %s", (provider) => {
  expect(() => assertWorkerOpProvider(provider)).not.toThrow();
});
