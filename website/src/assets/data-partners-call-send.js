import { sendRow } from "./row-send.js";

const SINK = {
  table: "data_partner_calls",
  label: "Call request",
  sheetSetting: "DATA_PARTNER_CALLS_SHEET_ENDPOINT",
};

export const sendCall = (row, config, fetchImpl) =>
  sendRow(SINK, row, config, fetchImpl);
