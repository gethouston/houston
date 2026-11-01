// Where a referral from /data-partners/refer goes. The row is stored in
// Supabase public.data_referrals, the source of truth, and copied to the
// "Data Partnerships - Referrals" tab of the team's Google Sheet
// (scripts/apps-script/data-partnerships-referrals.gs), both at once.
//
// Only Supabase decides the answer: 201 means stored. The sheet is written
// `no-cors`, so its answer is opaque and it decides nothing. Anything short of
// a 201 (no key in this build, a refusal, no answer within the timeout) comes
// back as "failed", and the form falls back to the email it used to send.
//
// Each sink is switched by its own setting: no Supabase key or no sheet
// endpoint means that sink is off, said once in the console by name.
// `fetchImpl` is injectable so the tests can pin the exact request.

const TABLE = "data_referrals";
const TIMEOUT_MS = 10000;

const off = (name, setting) =>
  globalThis.console?.warn(`Referral ${name} write off: ${setting} not set`);

async function supabaseWrite(row, config, fetchImpl) {
  if (!config.supabaseUrl || !config.supabaseAnonKey) {
    off("database", "SUPABASE_URL / SUPABASE_ANON_KEY");
    return null;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const origin = config.supabaseUrl.replace(/\/+$/, "");
    const response = await fetchImpl(`${origin}/rest/v1/${TABLE}`, {
      method: "POST",
      headers: {
        apikey: config.supabaseAnonKey,
        Authorization: `Bearer ${config.supabaseAnonKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(row),
      signal: controller.signal,
    });
    return response.status;
  } catch (error) {
    globalThis.console?.warn("Referral database write failed:", error);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function sheetWrite(row, config, fetchImpl) {
  if (!config.sheetEndpoint) {
    off("sheet", "DATA_REFERRALS_SHEET_ENDPOINT");
    return;
  }
  const body = JSON.stringify({
    ...row,
    submitted_at: new Date().toISOString(),
  });
  Promise.resolve()
    .then(() =>
      fetchImpl(config.sheetEndpoint, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body,
      }),
    )
    .catch((error) =>
      globalThis.console?.warn("Referral sheet write failed:", error),
    );
}

/** Resolves "stored" once Supabase has the row, otherwise "failed". */
export async function sendReferral(
  row,
  config,
  fetchImpl = globalThis.fetch.bind(globalThis),
) {
  sheetWrite(row, config, fetchImpl);
  const status = await supabaseWrite(row, config, fetchImpl);
  if (status === 201) return "stored";
  if (status !== null)
    globalThis.console?.warn(`Referral database write refused: ${status}`);
  return "failed";
}
