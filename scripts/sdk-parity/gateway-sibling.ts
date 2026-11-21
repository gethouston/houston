import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

const CLOUD_ROUTES = "internal/edge/routes.generated.json";

const configuredRoot = (): string | undefined =>
  process.env.HOUSTON_CLOUD_ROOT?.trim() || undefined;

export const cloudCheckoutRoot = (): string =>
  resolve(configuredRoot() ?? resolve(here, "../../../cloud"));

export const cloudCheckoutRoutes = (): string =>
  resolve(cloudCheckoutRoot(), CLOUD_ROUTES);

export interface CloudCheckout {
  root: string;
  routes: string;
  configured: boolean;
}

export const defaultCheckout = (): CloudCheckout => {
  const root = cloudCheckoutRoot();
  return {
    root,
    routes: resolve(root, CLOUD_ROUTES),
    configured: configuredRoot() !== undefined,
  };
};

export type SiblingStatus = "absent" | "agrees" | "ahead" | "elsewhere";

export interface SiblingCheck {
  status: SiblingStatus;
  notice: string;
}

export type ContainsCommit = (root: string, sha: string) => boolean;

export const gitContainsCommit: ContainsCommit = (root, sha) =>
  spawnSync("git", ["-C", root, "merge-base", "--is-ancestor", sha, "HEAD"], {
    stdio: "ignore",
  }).status === 0;

export interface VendoredFrom {
  cloudSha: string;
  ageInDays: number;
}

const canonical = (text: string): string =>
  text.replace(/\r\n/g, "\n").trimEnd();

const describe = ({ cloudSha, ageInDays }: VendoredFrom): string =>
  `cloud ${cloudSha.slice(0, 7)}, ${ageInDays} day${ageInDays === 1 ? "" : "s"} old`;

export function compareSibling(
  vendored: string,
  from: VendoredFrom,
  cloud: CloudCheckout | null,
  containsCommit: ContainsCommit = gitContainsCommit,
): SiblingCheck {
  if (!cloud)
    return {
      status: "absent",
      notice: `INFO: gateway inventory vendored from ${describe(from)} — no cloud checkout beside this repo to cross-check it against.`,
    };
  if (!existsSync(cloud.routes)) {
    if (cloud.configured && existsSync(cloud.root))
      throw new Error(
        `HOUSTON_CLOUD_ROOT is set to ${cloud.root}, but ${cloud.routes} is not there. Point it at a gethouston/cloud checkout, or unset it — the vendored inventory is judged either way.`,
      );
    return {
      status: "absent",
      notice: cloud.configured
        ? `INFO: HOUSTON_CLOUD_ROOT names ${cloud.root}, which is not there — the vendored gateway inventory (${describe(from)}) is judged on its own.`
        : `INFO: gateway inventory vendored from ${describe(from)} — no cloud checkout beside this repo to cross-check it against.`,
    };
  }
  if (canonical(readFileSync(cloud.routes, "utf8")) === canonical(vendored))
    return { status: "agrees", notice: "" };
  if (containsCommit(cloud.root, from.cloudSha))
    return {
      status: "ahead",
      notice: `WARNING: your cloud checkout at ${cloud.root} is AHEAD of the vendored gateway inventory (${describe(from)}). The gate judged the vendored copy, which is what CI judges — refresh it with \`pnpm vendor:gateway-routes\`.`,
    };
  return {
    status: "elsewhere",
    notice: `INFO: your cloud checkout at ${cloud.root} differs from the vendored gateway inventory (${describe(from)}) and does not carry that commit — a feature branch, or behind main. The gate judged the vendored copy, which is what CI judges.`,
  };
}
