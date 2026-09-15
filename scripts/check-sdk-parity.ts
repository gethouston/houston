import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { judge, parseExceptions } from "./sdk-parity/gate.ts";
import {
  readGatewayInventory,
  stampAgeInDays,
} from "./sdk-parity/gateway-inventory.ts";
import {
  desktopCalls,
  listRoutes,
  repoRoot,
  sdkMethods,
} from "./sdk-parity/inputs.ts";
import { checkRules } from "./sdk-parity/rules.ts";

/**
 * Does every route a signed-in human can reach have exactly one
 * `@houston/sdk` method, and does every SDK method reach a route some server
 * serves?
 *
 * It runs on every `pnpm check` (`check:sdk-parity`) and FAILS the process on
 * any violation the exceptions file does not excuse. Both servers are always
 * judged: the host declares its own route registry, and the gateway's is
 * vendored into scripts/sdk-parity/gateway-routes.generated.json, so a run with
 * no cloud checkout is a full run rather than a blind spot. Every remaining
 * violation is written down, with the reason it stands, in
 * scripts/sdk-parity-exceptions.json.
 *
 * Run with tsx, not `node --experimental-strip-types`: the host's modules
 * import each other extensionlessly, which Node's ESM resolver refuses.
 */
/** HOUSTON_SDK_PARITY_EXCEPTIONS points the gate at a fixture; its own test
 *  runs this script for real and needs a file with a violation left out. */
const EXCEPTIONS =
  process.env.HOUSTON_SDK_PARITY_EXCEPTIONS ??
  resolve(repoRoot, "scripts/sdk-parity-exceptions.json");

const host = listRoutes();
const gateway = readGatewayInventory();
if (gateway.source === "vendored")
  process.stdout.write(
    `INFO: gateway inventory vendored from cloud ${gateway.stamp.cloudSha.slice(0, 7)}, ${stampAgeInDays(gateway.stamp)} days old — no cloud checkout beside this repo to cross-check it against.\n`,
  );
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
  `SDK parity — ${host.length} host routes registered, ${gateway.routes.length} gateway routes (${gateway.source}), ${sdk.routed.length} routed SDK methods (${sdk.unroutable.length} the extractor cannot route), and the shipped client: ${desktop.sdk.length} adapter methods on the SDK, ${desktop.unbound.length} reaching a server without it, ${desktop.native.length} declared native commands.`,
);
process.stdout.write(report);
if (failures.length) {
  process.stderr.write(
    `\nSDK parity FAILED — ${failures.length} of them:\n  ${failures.join("\n  ")}\n`,
  );
  process.exit(1);
}
