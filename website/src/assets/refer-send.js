import { sendRow } from "./row-send.js";

const SINK = {
  table: "data_referrals",
  label: "Referral",
  sheetSetting: "DATA_REFERRALS_SHEET_ENDPOINT",
};

export const sendReferral = (row, config, fetchImpl) =>
  sendRow(SINK, row, config, fetchImpl);
