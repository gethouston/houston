import { invalidAgentNameMessage, validateAgentName } from "@houston/domain";
import { asSeedRecord, safeSeedKey } from "@houston/host/src/routes/agent-seed";

export interface SeedOp {
  kind: "seed";
  name: string;
  claudeMd?: string;
  seeds?: Record<string, string>;
  republish?: true;
}

export function parseSeedOp(raw: Record<string, unknown>): SeedOp {
  if (typeof raw.name !== "string") throw new Error("invalid 'op.name'");
  const name = validateAgentName(raw.name);
  if (!name.ok) throw new Error(invalidAgentNameMessage(name.reason));
  if (raw.claudeMd !== undefined && typeof raw.claudeMd !== "string")
    throw new Error("invalid 'op.claudeMd'");
  let seeds: Record<string, string> | undefined;
  if (raw.seeds !== undefined) {
    const parsed = asSeedRecord(raw.seeds);
    if (!parsed) throw new Error("invalid 'op.seeds'");
    for (const key of Object.keys(parsed))
      if (!safeSeedKey(key)) throw new Error(`unsafe seed path: ${key}`);
    seeds = parsed;
  }
  return {
    kind: "seed",
    name: name.name,
    ...(typeof raw.claudeMd === "string" ? { claudeMd: raw.claudeMd } : {}),
    ...(seeds ? { seeds } : {}),
    ...(raw.republish === true ? { republish: true as const } : {}),
  };
}
