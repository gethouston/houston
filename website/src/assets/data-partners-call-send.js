// Where a "Book a call" request from /data-partners goes. The row is stored in
// Supabase public.data_partner_calls, the source of truth, and copied to the
// "Data Partnerships - Calls" tab of the team's Google Sheet
// (scripts/apps-script/data-partnerships-calls.gs), both at once
// (row-send.js has the rules).

import { sendRow } from "./row-send.js";

const SINK = {
  table: "data_partner_calls",
  label: "Call request",
  sheetSetting: "DATA_PARTNER_CALLS_SHEET_ENDPOINT",
};

/** Resolves "stored" once Supabase has the row, otherwise "failed". */
export const sendCall = (row, config, fetchImpl) =>
  sendRow(SINK, row, config, fetchImpl);
