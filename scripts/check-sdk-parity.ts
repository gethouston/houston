import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { judge, parseExceptions } from "./sdk-parity/gate.ts";
import {
  gatewayExport,
  listRoutes,
  readGateway,
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
 * any violation the exceptions file does not excuse: the host's route registry
 * now declares the whole surface, so what the rules report is the real state of
 * the two clients against the two servers rather than an artefact of a
 * migration (PRODUCT-1820). Every remaining violation is written down, with the
 * reason it stands, in scripts/sdk-parity-exceptions.json.
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
const gateway = readGateway();
if (!gateway)
  process.stderr.write(
    `WARNING: no gateway route export at ${gatewayExport}. The gateway's routes are NOT checked — point HOUSTON_CLOUD_ROOT at the cloud checkout. This is a blind spot, not a pass.\n`,
  );
const sdk = sdkMethods();
const violations = checkRules(host, gateway ?? [], sdk.routed);
const exceptions = parseExceptions(
  JSON.parse(readFileSync(EXCEPTIONS, "utf8")),
  EXCEPTIONS,
);

const { report, failures } = judge(
  violations,
  exceptions,
  `SDK parity — ${host.length} host routes registered, ${gateway?.length ?? 0} gateway routes, ${sdk.routed.length} routed SDK methods (${sdk.unroutable.length} the extractor cannot route).`,
);
process.stdout.write(report);
if (failures.length) {
  process.stderr.write(
    `\nSDK parity FAILED — ${failures.length} of them:\n  ${failures.join("\n  ")}\n`,
  );
  process.exit(1);
}
