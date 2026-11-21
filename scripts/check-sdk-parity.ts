import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { judge, parseExceptions } from "./sdk-parity/gate.ts";
import { readGatewayInventory } from "./sdk-parity/gateway-inventory.ts";
import {
  desktopCalls,
  listRoutes,
  repoRoot,
  sdkMethods,
} from "./sdk-parity/inputs.ts";
import { checkRules } from "./sdk-parity/rules.ts";

const EXCEPTIONS =
  process.env.HOUSTON_SDK_PARITY_EXCEPTIONS ??
  resolve(repoRoot, "scripts/sdk-parity-exceptions.json");

const host = listRoutes();
const gateway = readGatewayInventory();
if (gateway.sibling.notice) process.stdout.write(`${gateway.sibling.notice}\n`);
const sdk = sdkMethods();
const desktop = desktopCalls();
const violations = checkRules(host, gateway.routes, sdk.routed, desktop);
const exceptions = parseExceptions(
  JSON.parse(readFileSync(EXCEPTIONS, "utf8")),
  EXCEPTIONS,
);

const { report, failures } = judge(
  violations,
  exceptions,
  `SDK parity — ${host.length} host routes registered, ${gateway.routes.length} gateway routes (vendored from cloud ${gateway.stamp.cloudSha.slice(0, 7)}), ${sdk.routed.length} routed SDK methods (${sdk.unroutable.length} the extractor cannot route), and the shipped client: ${desktop.sdk.length} adapter methods on the SDK, ${desktop.unbound.length} reaching a server without it, ${desktop.native.length} declared native commands.`,
);
process.stdout.write(report);
if (failures.length) {
  process.stderr.write(
    `\nSDK parity FAILED — ${failures.length} of them:\n  ${failures.join("\n  ")}\n`,
  );
  process.exit(1);
}
