import type { ServerResponse } from "node:http";
import type { ActivityContributor, HoustonEvent } from "@houston/protocol";
import type { Agent, Workspace } from "../domain/types";
import type { WorkspacePaths } from "../paths";
import type { PushReporter } from "../telemetry/push-report";
import type { Vfs } from "../vfs";
import {
  clearDeletedApprovals,
  substituteApprovals,
} from "./agents-turn-approvals";
import { admitTurnMessage } from "./agents-turn-message";
import {
  applyModeSwitch,
  recordLiveTurn,
  stampAttribution,
} from "./agents-turn-record";
import type { TurnBody } from "./turn-body";

export interface TurnSeamCtx {
  readonly pushReports?: PushReporter;
  readonly vfs?: Vfs;
  readonly paths: WorkspacePaths;
  readonly agent: Agent;
  readonly workspace: Workspace;
  readonly method: string;
  readonly rest: string;
  readonly emit?: (event: HoustonEvent) => void;
  readonly gatewayFronted: boolean;
  readonly actingAuthor: ActivityContributor | null;
  readonly actingAs?: string;
  readonly actor: string;
  readonly turnConversationId: string | undefined;
  readonly body: TurnBody;
  readonly message: TurnMessageState;
  client: ServerResponse;
}

export interface TurnMessageState {
  refusal?: { status: 400 | 409 | 503; code: string };
  duplicate: boolean;
  release?: () => void;
}

export type TurnSeam = (ctx: TurnSeamCtx) => Promise<void> | void;

export function turnConversationOf(
  method: string,
  rest: string,
): string | undefined {
  const match =
    method === "POST" ? rest.match(/^conversations\/([^/]+)\/messages$/) : null;
  return match?.[1] ? decodeURIComponent(match[1]) : undefined;
}

const SEAMS: TurnSeam[] = [
  admitTurnMessage,
  recordLiveTurn,
  applyModeSwitch,
  stampAttribution,
  clearDeletedApprovals,
  substituteApprovals,
];

export async function runTurnSeams(ctx: TurnSeamCtx): Promise<void> {
  for (const seam of SEAMS) {
    if (ctx.message.refusal) return;
    await seam(ctx);
  }
}
