import type {
  PlanCheckout,
  PlanRoutine,
  PlanRoutineKey,
  PlanSummary,
  PlusInvoice,
} from "@houston/wire-types";
import type { ModuleContext } from "../../module-context";
import { moduleScope, SdkHttpError } from "../http";
import {
  createPlusCheckout,
  createPlusPortal,
  dismissPlanAnnouncement,
  getPlan,
  keepRoutine,
  listPlanRoutines,
  listPlusInvoices,
  reportPresence,
  resumeRoutines,
} from "./http";
import { PlanCommand, requireRoutineKey } from "./types";

export { PlanCommand } from "./types";

export class PlanHttpError extends SdkHttpError {
  constructor(message: string, status: number) {
    super(message, status, "PlanHttpError");
  }
}

export interface PlanModule {
  getPlan(): Promise<PlanSummary>;
  dismissPlanAnnouncement(): Promise<void>;
  createPlusCheckout(): Promise<PlanCheckout>;
  createPlusPortal(): Promise<PlanCheckout>;
  listPlusInvoices(): Promise<{ invoices: PlusInvoice[] }>;
  listPlanRoutines(): Promise<{ routines: PlanRoutine[] }>;
  keepRoutine(key: PlanRoutineKey): Promise<PlanSummary>;
  resumeRoutines(): Promise<PlanSummary>;
  reportPresence(): Promise<void>;
}

export function createPlanModule(ctx: ModuleContext): PlanModule {
  const scope = moduleScope(ctx, "plan", PlanHttpError);
  const module: PlanModule = {
    getPlan: () => getPlan(scope),
    dismissPlanAnnouncement: () => dismissPlanAnnouncement(scope),
    createPlusCheckout: () => createPlusCheckout(scope),
    createPlusPortal: () => createPlusPortal(scope),
    listPlusInvoices: () => listPlusInvoices(scope),
    listPlanRoutines: () => listPlanRoutines(scope),
    keepRoutine: (key) => keepRoutine(scope, key),
    resumeRoutines: () => resumeRoutines(scope),
    reportPresence: () => reportPresence(scope),
  };
  ctx.registerCommand(PlanCommand.Get, () => module.getPlan());
  ctx.registerCommand(PlanCommand.DismissAnnouncement, () =>
    module.dismissPlanAnnouncement(),
  );
  ctx.registerCommand(PlanCommand.Checkout, () => module.createPlusCheckout());
  ctx.registerCommand(PlanCommand.Portal, () => module.createPlusPortal());
  ctx.registerCommand(PlanCommand.ListInvoices, () =>
    module.listPlusInvoices(),
  );
  ctx.registerCommand(PlanCommand.ListRoutines, () =>
    module.listPlanRoutines(),
  );
  ctx.registerCommand(PlanCommand.KeepRoutine, (p) =>
    module.keepRoutine(requireRoutineKey(p)),
  );
  ctx.registerCommand(PlanCommand.ResumeRoutines, () =>
    module.resumeRoutines(),
  );
  ctx.registerCommand(PlanCommand.Presence, () => module.reportPresence());
  return module;
}
