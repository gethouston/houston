import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, writeFileSync } from "node:fs";
import { relative } from "node:path";
import { VENDORED_ROUTES, VENDORED_STAMP } from "./gateway-inventory.ts";
import { cloudCheckoutRoot, cloudCheckoutRoutes } from "./gateway-sibling.ts";

const root = cloudCheckoutRoot();
const source = cloudCheckoutRoutes();

if (!existsSync(source)) {
  process.stderr.write(
    `No gateway route inventory at ${source}. Clone gethouston/cloud beside this repo, or point HOUSTON_CLOUD_ROOT at your checkout.\n`,
  );
  process.exit(1);
}

const cloudSha = execFileSync("git", ["-C", root, "rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();

copyFileSync(source, VENDORED_ROUTES);
writeFileSync(
  VENDORED_STAMP,
  `${JSON.stringify({ cloudSha, generatedAt: new Date().toISOString() }, null, 2)}\n`,
);

process.stdout.write(
  `Vendored ${relative(process.cwd(), VENDORED_ROUTES)} from cloud ${cloudSha.slice(0, 7)}.\n`,
);
