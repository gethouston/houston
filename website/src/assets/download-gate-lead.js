(() => {
  const PATH = "/v1/web/leads";
  const TIMEOUT_MS = 10000;
  const SOURCE = /^[a-z0-9_-]{1,64}$/;
  const UNKNOWN_SOURCE = "unknown";
  const LOCALES = ["en", "es", "pt"];
  const VISITOR_KEY = "houston_visitor_id";
  const MIRROR_SOURCE = "download_gate";

  const warn = (message, error) => {
    window.console?.warn(message, error);
  };

  const trimmed = (value) => (typeof value === "string" ? value.trim() : "");

  function visitorId() {
    const identity = window.HoustonAnalyticsIdentity;
    if (!identity || window.__houstonDNT) return null;
    let stored = null;
    try {
      stored = window.localStorage.getItem(VISITOR_KEY);
    } catch (_error) {}
    return identity.isUuidV4(stored) ? stored.trim().toLowerCase() : null;
  }

  function pageLocale() {
    const code = String(window.HOUSTON_LOCALE || "")
      .slice(0, 2)
      .toLowerCase();
    return LOCALES.includes(code) ? code : null;
  }

  function wireBody(lead) {
    const source = String(lead.source ?? "")
      .trim()
      .toLowerCase();
    const body = {
      email: trimmed(lead.email),
      full_name: trimmed(lead.name),
      source: SOURCE.test(source) ? source : UNKNOWN_SOURCE,
    };
    const optional = {
      phone: trimmed(lead.phone),
      phone_country_code: trimmed(lead.phoneCode),
      linkedin: trimmed(lead.linkedin),
      country: trimmed(lead.country),
      locale: pageLocale(),
      visitor_id: visitorId(),
    };
    for (const [key, value] of Object.entries(optional)) {
      if (value) body[key] = value;
    }
    return body;
  }

  function attempt(label, send) {
    const controller = window.AbortController
      ? new window.AbortController()
      : null;
    let giveUp = null;
    const abandoned = new Promise((resolve) => {
      giveUp = resolve;
    });
    const done = () => {
      window.clearTimeout(timer);
    };
    const failed = (error) => {
      done();
      warn(`${label} failed:`, error);
      return null;
    };
    const timer = window.setTimeout(() => {
      if (controller) {
        controller.abort();
        return;
      }
      giveUp(failed(new Error(`timed out after ${TIMEOUT_MS}ms`)));
    }, TIMEOUT_MS);
    try {
      const sent = send(controller ? controller.signal : undefined).then(
        (response) => {
          done();
          return response.status;
        },
        failed,
      );
      return Promise.race([sent, abandoned]);
    } catch (error) {
      return Promise.resolve(failed(error));
    }
  }

  function gatewayWrite(config, lead) {
    const origin = String(config.gatewayUrl || "").replace(/\/+$/, "");
    if (!origin) {
      warn("Gateway lead write skipped: origin missing");
      return Promise.resolve(null);
    }
    return attempt("Gateway lead write", (signal) =>
      window.fetch(`${origin}${PATH}`, {
        method: "POST",
        keepalive: false,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(wireBody(lead)),
        signal,
      }),
    );
  }

  function supabaseWrite(config, lead) {
    if (!config.supabaseUrl || !config.supabaseAnonKey)
      return Promise.resolve(null);
    return attempt("Supabase mirror write", (signal) =>
      window.fetch(`${config.supabaseUrl}/rest/v1/waitlist`, {
        method: "POST",
        headers: {
          apikey: config.supabaseAnonKey,
          Authorization: `Bearer ${config.supabaseAnonKey}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({
          full_name: lead.name,
          email: lead.email,
          phone: lead.phone,
          phone_country_code: lead.phoneCode,
          linkedin: lead.linkedin,
          country: lead.country,
          source: MIRROR_SOURCE,
        }),
        signal,
      }),
    );
  }

  function sheetWrite(config, lead) {
    if (!config.sheetEndpoint) return;
    try {
      window
        .fetch(config.sheetEndpoint, {
          method: "POST",
          mode: "no-cors",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify({ ...lead, source: MIRROR_SOURCE }),
        })
        .catch((error) => warn("Sheet mirror write failed:", error));
    } catch (error) {
      warn("Sheet mirror write failed:", error);
    }
  }

  const gatewayStored = (status) => status === 202;
  const mirrorStored = (status) =>
    status !== null && (status === 409 || (status >= 200 && status < 300));

  function refusal(message, rateLimited) {
    const error = new Error(message);
    error.rateLimited = rateLimited;
    return error;
  }

  function submit(config, lead) {
    const settings = config || {};
    const gateway = gatewayWrite(settings, lead);
    const supabase = supabaseWrite(settings, lead);
    sheetWrite(settings, lead);
    return Promise.all([gateway, supabase]).then(
      ([leadStatus, mirrorStatus]) => {
        if (leadStatus !== null && !gatewayStored(leadStatus))
          warn(`Gateway lead write refused: ${leadStatus}`);
        if (mirrorStatus !== null && !mirrorStored(mirrorStatus))
          warn(`Supabase mirror write refused: ${mirrorStatus}`);
        if (leadStatus === 400)
          throw refusal("lead refused: the details are invalid (400)", false);
        if (gatewayStored(leadStatus) || mirrorStored(mirrorStatus)) return;
        throw refusal(
          `lead stored nowhere (gateway: ${leadStatus})`,
          leadStatus === 429,
        );
      },
    );
  }

  window.HoustonDLLead = { submit };
})();
