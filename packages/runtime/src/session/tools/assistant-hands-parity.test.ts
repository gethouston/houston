import { ASSISTANT_HANDS_TOOLS } from "@houston/domain/assistant-hands";
import { HANDS_ON_SURFACES } from "@houston/protocol";
import { expect, test } from "vitest";
import { REQUEST_CONNECTION_TOOL_NAME } from "./integrations";
import { REQUEST_CREDENTIAL_TOOL_NAME } from "./request-credential";
import { REQUEST_HANDS_ON_TOOL_NAME } from "./request-hands-on";
import { REQUEST_PROVIDER_CONNECTION_TOOL_NAME } from "./request-provider-connection";

test("the catalog's card vocabulary is the runtime's tool names", () => {
  expect([...ASSISTANT_HANDS_TOOLS].sort()).toEqual(
    [
      REQUEST_CONNECTION_TOOL_NAME,
      REQUEST_CREDENTIAL_TOOL_NAME,
      REQUEST_PROVIDER_CONNECTION_TOOL_NAME,
      REQUEST_HANDS_ON_TOOL_NAME,
    ].sort(),
  );
});

test("the surfaces the generator validates are the ones request_hands_on opens", async () => {
  const leaf = await import("@houston/protocol/interaction-types");
  expect([...leaf.HANDS_ON_SURFACES]).toEqual([...HANDS_ON_SURFACES]);
});
