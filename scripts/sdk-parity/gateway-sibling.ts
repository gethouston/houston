import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The `gethouston/cloud` checkout beside this repo — consulted, never obeyed.
 *
 * The gate judges the VENDORED inventory (`./gateway-inventory.ts`), because
 * that is the file CI judges. A developer's checkout can be on any branch, so
 * letting it decide would mean one verdict per desk. It is read only to say
 * something useful about the vendored copy: stale (the checkout carries the
 * stamped commit and newer routes), or simply elsewhere (a branch, or behind
 * main — routes that have not shipped and may never).
 */

const here = dirname(fileURLToPath(import.meta.url));

/** The inventory's path inside a `gethouston/cloud` checkout. */
const CLOUD_ROUTES = "internal/edge/routes.generated.json";

/** Set and non-blank, or nothing — an empty variable names no checkout. */
const configuredRoot = (): string | undefined =>
  process.env.HOUSTON_CLOUD_ROOT?.trim() || undefined;

/** The sibling cloud checkout; HOUSTON_CLOUD_ROOT overrides the default. */
export const cloudCheckoutRoot = (): string =>
  resolve(configuredRoot() ?? resolve(here, "../../../cloud"));

export const cloudCheckoutRoutes = (): string =>
  resolve(cloudCheckoutRoot(), CLOUD_ROUTES);

/** A checkout to consult, and whether a human named it. */
export interface CloudCheckout {
  root: string;
  routes: string;
  /** HOUSTON_CLOUD_ROOT named it, so an inventory missing there is a mistake. */
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

/**
 * What the consulted checkout had to say. `agrees` and `absent` are the
 * everyday states; `ahead` means the vendored copy is stale; `elsewhere` means
 * the checkout is on a branch or behind main, so its routes are nobody's truth.
 */
export type SiblingStatus = "absent" | "agrees" | "ahead" | "elsewhere";

export interface SiblingCheck {
  status: SiblingStatus;
  /** One line for the caller to print; empty when there is nothing to say. */
  notice: string;
}

/** Whether the checkout's history contains `sha` — i.e. its HEAD is newer. */
export type ContainsCommit = (root: string, sha: string) => boolean;

export const gitContainsCommit: ContainsCommit = (root, sha) =>
  spawnSync("git", ["-C", root, "merge-base", "--is-ancestor", sha, "HEAD"], {
    stdio: "ignore",
  }).status === 0;

/** Where the vendored copy came from, as the notices name it. */
export interface VendoredFrom {
  cloudSha: string;
  ageInDays: number;
}

/** Line endings and the trailing newline are checkout artefacts, not content. */
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
    // A root that is not there at all is a checkout nobody has cloned — a CI
    // runner, a fresh machine, a variable left over from a deleted tree. A
    // root that IS there without a gateway inventory is a variable aimed at
    // the wrong directory, and silently ignoring it would hide the mistake.
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
