// Where a registration from the download gate goes. This is the dual-write
// window of the cutover: the lead is posted to the Houston gateway
// (POST /v1/web/leads) and to the two legacy mirrors, the Supabase row and the
// Google Sheet, independently and at the same time, none waiting on another.
//
// The download unlocks as soon as ANY sink has stored the lead: a gateway 202,
// or a Supabase 2xx/409. The sheet is written `no-cors`, so its answer is
// opaque and it unlocks nothing by itself. Two outcomes hold the download shut:
// every sink failed, so there is no visitor to follow up on anywhere, or the
// gateway answered 400, the one refusal that says the submitted details are
// wrong and can be corrected. A gateway 429 with a mirror row written is not a
// failure: everyone behind one shared address hits that limit together, and the
// lead is stored. Step 5 of the cutover (C18 in the cloud repo) is where this
// flips: the mirrors go, and the gateway's answer alone gates the download.
//
// Modern syntax (const, arrow functions, optional chaining) is deliberate: the
// site has no ES5 floor, and the older `var`/`function` assets beside this one
// are history, not a rule.
(() => {
  const PATH = "/v1/web/leads";
  const TIMEOUT_MS = 10000;
  // The entry point the modal was opened from (`data-dl-source`), in the shape
  // the gateway accepts. Anything else would cost the whole request, so it is
  // reported as the unknown entry point instead.
  const SOURCE = /^[a-z0-9_-]{1,64}$/;
  const UNKNOWN_SOURCE = "unknown";
  const LOCALES = ["en", "es", "pt"];
  const VISITOR_KEY = "houston_visitor_id";
  // The constant the two mirrors have always written in their source column, so
  // rows written before this release keep matching the ones written after it.
  // The entry point is a gateway field and stays out of them.
  const MIRROR_SOURCE = "download_gate";

  const warn = (message, error) => {
    window.console?.warn(message, error);
  };

  const trimmed = (value) => (typeof value === "string" ? value.trim() : "");

  // Read, never minted: the funnel's ids belong to
  // `houston-analytics-identity.js`, and a shape the gateway refuses would cost
  // the whole request, so the id travels only when that asset vouches for it. A
  // visitor who opted out of tracking sends none at all, the same answer
  // base.njk hands every analytics sink; the lead still lands without it.
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

  // Only fields that carry a value, so an empty optional is absent rather than
  // an empty string the gateway would reject.
  function wireBody(lead) {
    // The buttons name their entry points for people ("Hero"); the gateway
    // reads them in lower case.
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

  // Both gating sinks run on the same clock: a request that never answers must
  // not leave the visitor watching "Preparing your download…" forever. Resolves
  // with the HTTP status, or null when the request never completed, and never
  // rejects — the caller reads the pair and decides.
  function attempt(label, send) {
    const controller = window.AbortController
      ? new window.AbortController()
      : null;
    let giveUp = null;
    // A browser without AbortController cannot cancel the request, so the clock
    // answers for it: the attempt gives up here while the request runs on
    // unheard. Without this the wait would have no end on those browsers.
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
    // Aborting rejects the request, which `failed` already answers; the clock
    // is armed either way so no sink can hang the download.
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
        // Not a keepalive request: the visitor stays on the page until these
        // answers decide whether the download unlocks, and keepalive caps the
        // body for a send meant to outlive the page.
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

  // `no-cors` hands back an opaque answer that says nothing about the row, so
  // the sheet gates nothing and is never waited on.
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

  // 202 covers a repeat address: the gateway accepts the lead and decides for
  // itself whether it is new. Supabase says the same thing with 409.
  const gatewayStored = (status) => status === 202;
  const mirrorStored = (status) =>
    status !== null && (status === 409 || (status >= 200 && status < 300));

  function refusal(message, rateLimited) {
    const error = new Error(message);
    // 429 is the one refusal with its own answer for the visitor: wait, retry.
    error.rateLimited = rateLimited;
    return error;
  }

  /**
   * Resolves once any sink has stored the lead. Rejects when none did, with
   * `rateLimited` set if the gateway answered 429, and whenever the gateway
   * called the details invalid, whatever the mirrors made of them.
   */
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
