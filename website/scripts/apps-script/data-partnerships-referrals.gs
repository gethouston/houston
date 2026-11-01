/**
 * Data Partnerships - Referrals: the Google Sheet copy of every referral sent
 * from gethouston.ai/data-partners/refer. Supabase public.data_referrals is
 * the source of truth; this tab is for the team to read.
 *
 * The site posts each referral here as JSON in a text/plain body (`no-cors`,
 * so it never sees the answer): website/src/assets/refer-send.js.
 *
 * Setup, once:
 *  1. Create a NEW standalone Apps Script project (script.google.com, "New
 *     project"), not one bound to a sheet: the waitlist's script already owns
 *     doPost in its own project. Paste this file in as Code.gs.
 *  2. Project Settings > Script properties: add SPREADSHEET_ID, the id in the
 *     sheet's URL (docs.google.com/spreadsheets/d/<SPREADSHEET_ID>/edit).
 *  3. Deploy > New deployment > Web app. Execute as: Me. Who has access:
 *     Anyone. Copy the web app URL.
 *  4. Set that URL as the DATA_REFERRALS_SHEET_ENDPOINT secret of the
 *     website deploy workflow (.github/workflows/website-deploy.yml).
 * The tab and its header row are created on the first referral.
 *
 * Changing COLUMNS: add new ones at the end so existing rows keep lining up,
 * and redeploy (Deploy > Manage deployments > edit > New version).
 */

const TAB = "Data Partnerships - Referrals";

// [header, field in the posted row]. Order is the column order.
const COLUMNS = [
  ["Submitted at", "submitted_at"],
  ["Referrer name", "referrer_name"],
  ["Referrer email", "referrer_email"],
  ["Request", "listing"],
  ["Company", "company_name"],
  ["Website", "company_website"],
  ["Employees", "company_size"],
  ["Years in business", "years_in_business"],
  ["Language", "locale"],
  ["Page", "page"],
];

// Longest value a cell takes, so a junk post can't flood the sheet.
const MAX_CELL = 2000;

function doPost(e) {
  let row;
  try {
    row = JSON.parse((e && e.postData && e.postData.contents) || "{}");
  } catch (_error) {
    return answer("bad json");
  }
  if (!row.company_name || !row.referrer_email) return answer("missing fields");

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = tab();
    sheet.appendRow(COLUMNS.map(([, key]) => cell(row[key])));
  } finally {
    lock.releaseLock();
  }
  return answer("ok");
}

function tab() {
  const id = PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID");
  const book = SpreadsheetApp.openById(id);
  let sheet = book.getSheetByName(TAB);
  if (!sheet) {
    sheet = book.insertSheet(TAB);
    sheet.appendRow(COLUMNS.map(([header]) => header));
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, COLUMNS.length).setFontWeight("bold");
  }
  return sheet;
}

// Text a spreadsheet will not run: a leading = + - @ would make a formula.
function cell(value) {
  if (value === null || value === undefined) return "";
  const text = String(value).slice(0, MAX_CELL);
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

function answer(text) {
  return ContentService.createTextOutput(text);
}
