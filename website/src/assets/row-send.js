// Stores one row from a public form: an insert into a Supabase table, the
// source of truth, and a copy to a Google Sheet tab, both at once. The
// referral form (refer-send.js) and the /data-partners call form
// (data-partners-call-send.js) each name their own sink.
//
// Only Supabase decides the answer: 201 means stored. The sheet is written
// `no-cors`, so its answer is opaque and it decides nothing. Anything short of
// a 201 (no key in this build, a refusal, no answer within the timeout) comes
// back as "failed".
//
// Each sink is switched by its own setting: no Supabase key or no sheet
// endpoint means that sink is off, said once in the console by name.
// `fetchImpl` is injectable so the tests can pin the exact request.

const TIMEOUT_MS = 10000;

const warn = (...args) => globalThis.console?.warn(...args);
const off = (sink, name, setting) =>
  warn(`${sink.label} ${name} write off: ${setting} not set`);

async function supabaseWrite(sink, row, config, fetchImpl) {
  if (!config.supabaseUrl || !config.supabaseAnonKey) {
    off(sink, "database", "SUPABASE_URL / SUPABASE_ANON_KEY");
    return null;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const origin = config.supabaseUrl.replace(/\/+$/, "");
    const response = await fetchImpl(`${origin}/rest/v1/${sink.table}`, {
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
    warn(`${sink.label} database write failed:`, error);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function sheetWrite(sink, row, config, fetchImpl) {
  if (!config.sheetEndpoint) {
    off(sink, "sheet", sink.sheetSetting);
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
    .catch((error) => warn(`${sink.label} sheet write failed:`, error));
}

/**
 * Resolves "stored" once Supabase has the row, otherwise "failed".
 * `sink` is { table, label, sheetSetting }: the table, the name the console
 * warnings use, and the setting that switches the sheet copy on.
 */
export async function sendRow(
  sink,
  row,
  config,
  fetchImpl = globalThis.fetch.bind(globalThis),
) {
  sheetWrite(sink, row, config, fetchImpl);
  const status = await supabaseWrite(sink, row, config, fetchImpl);
  if (status === 201) return "stored";
  if (status !== null) warn(`${sink.label} database write refused: ${status}`);
  return "failed";
}
