import type { ModuleContext } from "../../module-context";
import {
  parseCreate,
  parseDelete,
  parseRefresh,
  parseRename,
  parseSetStatus,
} from "./payloads";
import { ActivitiesCommand, type CreatedActivity } from "./types";

/** The write/read handlers the bridge `dispatch` path shares with the facade. */
export interface ActivitiesCommandHandlers {
  refresh(agentId: string): Promise<void>;
  create(
    agentId: string,
    title: string,
    description?: string,
  ): Promise<CreatedActivity>;
  setStatus(agentId: string, id: string, status: string): Promise<void>;
  rename(agentId: string, id: string, title: string): Promise<void>;
  del(agentId: string, id: string): Promise<void>;
}

/**
 * Wire the five `activities/*` commands to the module handlers, so the bridge
 * `dispatch` path and the typed facade share one implementation each.
 */
export function registerActivitiesCommands(
  ctx: ModuleContext,
  { refresh, create, setStatus, rename, del }: ActivitiesCommandHandlers,
): void {
  ctx.registerCommand(ActivitiesCommand.Refresh, (p) =>
    refresh(parseRefresh(p).agentId),
  );
  ctx.registerCommand(ActivitiesCommand.Create, (p) => {
    const { agentId, title, description } = parseCreate(p);
    return create(agentId, title, description);
  });
  ctx.registerCommand(ActivitiesCommand.SetStatus, (p) => {
    const { agentId, id, status } = parseSetStatus(p);
    return setStatus(agentId, id, status);
  });
  ctx.registerCommand(ActivitiesCommand.Rename, (p) => {
    const { agentId, id, title } = parseRename(p);
    return rename(agentId, id, title);
  });
  ctx.registerCommand(ActivitiesCommand.Delete, (p) => {
    const { agentId, id } = parseDelete(p);
    return del(agentId, id);
  });
}
