// Where a referral from /data-partners/refer goes. The row is stored in
// Supabase public.data_referrals, the source of truth, and copied to the
// "Data Partnerships - Referrals" tab of the team's Google Sheet
// (scripts/apps-script/data-partnerships-referrals.gs), both at once
// (row-send.js has the rules). A "failed" answer leaves the form as filled so
// the visitor can send again.

import { sendRow } from "./row-send.js";

const SINK = {
  table: "data_referrals",
  label: "Referral",
  sheetSetting: "DATA_REFERRALS_SHEET_ENDPOINT",
};

/** Resolves "stored" once Supabase has the row, otherwise "failed". */
export const sendReferral = (row, config, fetchImpl) =>
  sendRow(SINK, row, config, fetchImpl);
