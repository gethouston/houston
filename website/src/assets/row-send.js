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
