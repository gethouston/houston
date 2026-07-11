import { expect, test } from "vitest";
import {
  classifyDeployEnvironment,
  type DeployEnvironment,
} from "../src/deploy-environment";

const cases: Array<[string, DeployEnvironment]> = [
  // Production is the single canonical domain.
  ["app.gethouston.ai", "production"],
  ["APP.GETHOUSTON.AI", "production"],
  // Preview: the vanity domain + Firebase default domains for both sites.
  ["preview.gethouston.ai", "preview"],
  ["houston-web.web.app", "preview"],
  ["houston-web-preview.web.app", "preview"],
  ["houston-web.firebaseapp.com", "preview"],
  // Local development.
  ["localhost", "development"],
  ["app.localhost", "development"],
  ["127.0.0.1", "development"],
  ["::1", "development"],
  ["[::1]", "development"],
  // Anything unrecognized must never be mistaken for production.
  ["some-preview-channel--abc123.web.app", "preview"],
  ["staging.gethouston.ai", "preview"],
];

for (const [hostname, expected] of cases) {
  test(`classifies ${hostname} as ${expected}`, () => {
    expect(classifyDeployEnvironment(hostname)).toBe(expected);
  });
}

test("a lookalike production host is NOT production", () => {
  // Guards against a naive `includes("app.gethouston.ai")` regression.
  expect(classifyDeployEnvironment("app.gethouston.ai.evil.com")).toBe(
    "preview",
  );
  expect(classifyDeployEnvironment("notapp.gethouston.ai")).toBe("preview");
});
