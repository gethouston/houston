import type {
  PlanCheckout,
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
  listPlusInvoices,
} from "./http";
import { PlanCommand } from "./types";

export { PlanCommand } from "./types";

export class PlanHttpError extends SdkHttpError {
  constructor(message: string, status: number) {
    super(message, status, "PlanHttpError");
  }
}

/** The per-person plan, bound to `/v1/me/plan*` and `/v1/me/plus/*` only. */
export interface PlanModule {
  getPlan(): Promise<PlanSummary>;
  dismissPlanAnnouncement(): Promise<void>;
  createPlusCheckout(): Promise<PlanCheckout>;
  createPlusPortal(): Promise<PlanCheckout>;
  listPlusInvoices(): Promise<{ invoices: PlusInvoice[] }>;
}

export function createPlanModule(ctx: ModuleContext): PlanModule {
  const scope = moduleScope(ctx, "plan", PlanHttpError);
  const module: PlanModule = {
    getPlan: () => getPlan(scope),
    dismissPlanAnnouncement: () => dismissPlanAnnouncement(scope),
    createPlusCheckout: () => createPlusCheckout(scope),
    createPlusPortal: () => createPlusPortal(scope),
    listPlusInvoices: () => listPlusInvoices(scope),
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
  return module;
}
