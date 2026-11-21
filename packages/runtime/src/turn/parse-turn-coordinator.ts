import {
  type GrantableOperation,
  MessageGrantsSchema,
} from "@houston/protocol";
import { exactKeys, nonEmpty, record } from "./parse-turn-fields";
import type { TurnCoordinator, TurnRequest } from "./types";

export function parseTurnCoordinator(
  b: Record<string, unknown>,
  turn: Pick<TurnRequest, "claim" | "grant" | "actingAs"> & {
    shadow: boolean;
  },
): Pick<TurnRequest, "coordinator" | "approvals" | "grants"> {
  const coordinator =
    b.coordinator === undefined ? undefined : parseCoordinator(b.coordinator);
  if (coordinator) {
    if (!turn.claim) throw new Error("a coordinator turn requires a claim");
    if (!turn.grant) throw new Error("a coordinator turn requires a grant");
    if (!turn.actingAs)
      throw new Error("a coordinator turn requires an acting person");
    if (turn.shadow) throw new Error("a shadow turn cannot be a coordinator");
  }
  for (const field of ["approvals", "grants"] as const) {
    if (b[field] !== undefined && !coordinator) {
      throw new Error(`'${field}' requires a coordinator turn`);
    }
  }
  let grants: GrantableOperation[] | undefined;
  if (b.grants !== undefined) {
    const parsed = MessageGrantsSchema.safeParse(b.grants);
    if (!parsed.success) throw new Error("invalid 'grants'");
    grants = parsed.data;
  }
  return {
    ...(coordinator ? { coordinator } : {}),
    ...(b.approvals !== undefined ? { approvals: b.approvals } : {}),
    ...(grants ? { grants } : {}),
  };
}

function parseCoordinator(value: unknown): TurnCoordinator {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("invalid 'coordinator'");
  }
  const block = record(value, "coordinator");
  exactKeys(block, ["token", "expires"], "coordinator");
  if (
    !nonEmpty(block.token) ||
    block.token.length > 16384 ||
    typeof block.expires !== "number" ||
    !Number.isSafeInteger(block.expires) ||
    block.expires <= 0
  ) {
    throw new Error("invalid 'coordinator'");
  }
  return { token: block.token, expires: block.expires };
}
