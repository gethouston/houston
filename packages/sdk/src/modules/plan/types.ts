/**
 * The per-person plan's commands: the summary, the launch announcement and
 * the Plus subscription. A free org's routines and presence are the billing
 * family's (`../billing`).
 */
export const PlanCommand = {
  Get: "plan/get",
  Checkout: "plan/checkout",
  Portal: "plan/portal",
  ListInvoices: "plan/listInvoices",
  DismissAnnouncement: "plan/dismissAnnouncement",
} as const;
