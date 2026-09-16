/**
 * The read-path up-migration chain, split from the schema-of-record so `ir.ts`
 * stays free of relative imports: `ir.ts` is served raw over the package's
 * `./ir` subpath and loaded by runtimes that resolve TypeScript without a
 * bundler, which cannot follow an extensionless relative specifier.
 */
import { AGENT_IR_VERSION, type AgentIR, agentIrSchema } from "./ir";

/**
 * Ordered up-migration steps. Each lifts a stored IR from one version to the
 * next. On a MAJOR bump, prepend the new step here and `migrateAgentIr` lifts any
 * stored snapshot to current before validation. v2.0.0 is the floor — v1 never
 * shipped, so the chain is empty and `migrateAgentIr` is a validating passthrough.
 */
type MigrationStep = {
  /** matches when raw.irVersion === from */
  from: string;
  to: typeof AGENT_IR_VERSION;
  up: (raw: Record<string, unknown>) => Record<string, unknown>;
};

export const IR_MIGRATIONS: MigrationStep[] = [];

/**
 * Lift any stored raw IR to the current version, then validate. Throws if the raw
 * payload cannot be validated after migration.
 */
export function migrateAgentIr(input: unknown): AgentIR {
  if (input === null || typeof input !== "object") {
    throw new Error("migrateAgentIr: input must be an object");
  }
  let cur = { ...(input as Record<string, unknown>) };

  let guard = 0;
  while (
    cur.irVersion !== AGENT_IR_VERSION &&
    guard < IR_MIGRATIONS.length + 1
  ) {
    const step = IR_MIGRATIONS.find((m) => m.from === cur.irVersion);
    if (!step) break;
    cur = step.up(cur);
    cur.irVersion = step.to;
    guard += 1;
  }

  return agentIrSchema.parse(cur);
}
