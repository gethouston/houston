#!/usr/bin/env node
/**
 * Publish (or update) the release-bundled starter agents (`store/agents/<id>/`)
 * to the Houston Agent Store via the gateway. Idempotent: lists the caller's
 * agents, matches each starter by `slugify(name)` (independent of the gateway's
 * finalized share slug, which may be suffixed or null on an unpublished agent),
 * and PATCHes the existing listing or POSTs a new one — both with
 * `publish: true`. Prints a per-agent result table and exits nonzero if any
 * agent fails.
 *
 *   node scripts/publish-starter-agents.mjs --dry-run
 *   HOUSTON_STORE_TOKEN=<bearer> node scripts/publish-starter-agents.mjs --only sales,support
 *
 * Flags:
 *   --gateway <url>   gateway origin (default https://staging-gateway.gethouston.ai)
 *   --token <bearer>  bearer token; falls back to env HOUSTON_STORE_TOKEN
 *   --dry-run         validate + print IR summaries only, no network
 *   --only <id,...>   restrict to these starter agent ids
 *
 * The bearer is the Firebase ID token from a signed-in Houston app session.
 * Granting the @houston handle to the publishing account is a separate
 * admin-console step (see store/README.md).
 */
import { register } from "tsx/esm/api";

// tsx ESM loader: lets this plain-node script import the TS `agentstore-*` pkgs.
register();

const { AgentStoreClient, StoreApiError } = await import(
  "@houston/agentstore-client"
);
const { buildStarterAgentIr, indexExistingBySlug, listStarterAgentIds } =
  await import("./lib/starter-agent-ir.mjs");

const DEFAULT_GATEWAY = "https://staging-gateway.gethouston.ai";

function requireValue(argv, i, flag) {
  const value = argv[i];
  if (value === undefined) throw new Error(`${flag} requires a value`);
  return value;
}

function parseArgs(argv) {
  const opts = {
    gateway: DEFAULT_GATEWAY,
    token: null,
    dryRun: false,
    only: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--dry-run":
        opts.dryRun = true;
        break;
      case "--gateway":
        opts.gateway = requireValue(argv, ++i, arg);
        break;
      case "--token":
        opts.token = requireValue(argv, ++i, arg);
        break;
      case "--only":
        opts.only = requireValue(argv, ++i, arg)
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        break;
      default:
        throw new Error(`unknown argument "${arg}"`);
    }
  }
  return opts;
}

function resolveIds(only) {
  const all = listStarterAgentIds();
  if (!only) return all;
  const unknown = only.filter((id) => !all.includes(id));
  if (unknown.length) {
    throw new Error(
      `unknown --only id(s): ${unknown.join(", ")} (known: ${all.join(", ")})`,
    );
  }
  return all.filter((id) => only.includes(id));
}

function printDryRun(built) {
  console.log(`Dry run — validated ${built.length} agent IR(s), no network:\n`);
  for (const { id, ir } of built) {
    console.log(`• ${id} → ${ir.identity.slug}  "${ir.identity.name}"`);
    console.log(
      `    category=${ir.identity.category}  tags=[${ir.identity.tags.join(", ")}]`,
    );
    console.log(
      `    skills=${ir.skills.length}  integrations=${ir.integrations.length}` +
        `  instructions=${ir.instructions.length}b`,
    );
    console.log(`    integrations=[${ir.integrations.join(", ")}]`);
  }
}

function describeError(err) {
  if (err instanceof StoreApiError) {
    return `HTTP ${err.status}${err.code ? ` ${err.code}` : ""}: ${err.message}`;
  }
  return err instanceof Error ? err.message : String(err);
}

function printResults(results) {
  const pad = (s, n) => String(s).padEnd(n);
  console.log(
    `\n${pad("agent", 12)}${pad("action", 9)}${pad("slug", 26)}shareUrl / error`,
  );
  console.log("-".repeat(80));
  for (const r of results) {
    console.log(
      `${pad(r.id, 12)}${pad(r.action, 9)}${pad(r.slug, 26)}${r.detail}`,
    );
  }
}

async function publishOne(client, existingBySlug, id, ir) {
  const existing = existingBySlug.get(ir.identity.slug);
  if (existing) {
    const res = await client.patchAgent(existing.id, { ir, publish: true });
    return {
      id,
      action: "updated",
      slug: res.agent.slug ?? ir.identity.slug,
      detail: "-",
    };
  }
  const res = await client.createAgent({ ir, publish: true });
  return {
    id,
    action: "created",
    slug: res.slug ?? ir.identity.slug,
    detail: res.shareUrl ?? "-",
  };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const ids = resolveIds(opts.only);

  // Build + validate every IR up front so a mapping error aborts before network.
  const built = ids.map((id) => ({ id, ir: buildStarterAgentIr(id) }));

  if (opts.dryRun) {
    printDryRun(built);
    return;
  }

  const token = opts.token ?? process.env.HOUSTON_STORE_TOKEN ?? null;
  if (!token) {
    throw new Error(
      "missing bearer token — pass --token <bearer> or set HOUSTON_STORE_TOKEN " +
        "(the Firebase ID token from a signed-in Houston app session)",
    );
  }

  const client = new AgentStoreClient({
    baseUrl: opts.gateway,
    getToken: () => token,
  });

  const existingBySlug = indexExistingBySlug(await client.listMyAgents());

  const results = [];
  let failures = 0;
  for (const { id, ir } of built) {
    try {
      results.push(await publishOne(client, existingBySlug, id, ir));
    } catch (err) {
      failures += 1;
      results.push({
        id,
        action: "FAILED",
        slug: ir.identity.slug,
        detail: describeError(err),
      });
    }
  }

  printResults(results);
  if (failures > 0) {
    throw new Error(
      `${failures} of ${built.length} agent(s) failed to publish`,
    );
  }
  console.log(`\nPublished ${built.length} agent(s) to ${opts.gateway}.`);
}

main().catch((err) => {
  console.error(`\npublish-starter-agents: ${describeError(err)}`);
  process.exit(1);
});
