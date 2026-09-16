// The registration step inside the download modal: its country menus, its field
// validation, and what the visitor sees while the lead is delivered. Where the
// lead actually goes — the Houston gateway and the legacy mirrors, written at
// once — is download-gate-lead.js.
(() => {
  // window.houstonT comes from the inline i18n block; fall back to the English
  // literal if a page ever loads this script without it.
  function tr(path, fallback) {
    return window.houstonT ? window.houstonT(path, fallback) : fallback;
  }

  function rowHtml(row, withDial) {
    return (
      `<span class="dl-dd-flag">${row.flag}</span>` +
      `<span class="dl-dd-name">${row.display}</span>` +
      (withDial ? `<span class="dl-dd-dial">${row.dial}</span>` : "")
    );
  }

  function init(opts) {
    var dropdowns = window.HoustonDropdown;
    var form = document.getElementById("dl-form");
    var submit = document.getElementById("dl-submit");
    var formError = document.getElementById("dl-form-err");
    var country = document.getElementById("dl-country");
    var countryValue = document.getElementById("dl-country-value");
    var phoneCode = document.getElementById("dl-phone-code");
    var ccFlag = document.getElementById("dl-cc-flag");
    var ccAbbr = document.getElementById("dl-cc-abbr");
    var ccDial = document.getElementById("dl-cc-dial");
    var ccRoot = document.getElementById("dl-cc");
    var countryRoot = document.getElementById("dl-country-dd");
    if (!form || !submit || !country || !phoneCode || !dropdowns) return;
    if (!ccRoot || !countryRoot) return;

    var locale = window.HOUSTON_LOCALE || "en";
    var rows = dropdowns.countryRows(window.HOUSTON_COUNTRIES || [], locale);
    var byIso = {};
    rows.forEach((row) => {
      byIso[row.iso] = row;
    });

    // The dial-code menu leads with the United States, then follows the same
    // locale-sorted order as the country menu.
    var dialRows = rows.slice();
    var usIndex = dialRows.findIndex((row) => row.iso === "US");
    if (usIndex > -1) dialRows.unshift(dialRows.splice(usIndex, 1)[0]);

    var codeMenu = dropdowns.create({
      root: ccRoot,
      toggle: document.getElementById("dl-cc-toggle"),
      menu: document.getElementById("dl-cc-menu"),
      list: document.getElementById("dl-cc-list"),
      search: document.getElementById("dl-cc-search"),
      empty: document.getElementById("dl-cc-empty"),
      menuWidth: 290,
      items: dialRows.map((row) => ({
        id: row.iso,
        value: row.dial,
        label: row.display,
        search: `${row.haystack} ${row.dial}`,
        html: rowHtml(row, true),
      })),
      onSelect: (item) => {
        var row = byIso[item.id];
        ccFlag.textContent = row.flag;
        ccAbbr.textContent = row.iso;
        ccDial.textContent = row.dial;
        phoneCode.value = row.dial;
      },
    });

    dropdowns.create({
      root: countryRoot,
      toggle: document.getElementById("dl-country-toggle"),
      menu: document.getElementById("dl-country-menu"),
      list: document.getElementById("dl-country-list"),
      search: document.getElementById("dl-country-search"),
      empty: document.getElementById("dl-country-empty"),
      // The posted value stays the English name so Supabase rows keep matching
      // the ones written before the gate was localized.
      items: rows.map((row) => ({
        id: row.iso,
        value: row.english,
        label: row.display,
        search: row.haystack,
        html: rowHtml(row, false),
      })),
      onSelect: (item) => {
        country.value = item.value;
        countryValue.textContent = item.label;
        countryValue.classList.remove("is-placeholder");
        document.getElementById("dl-f-country").dataset.touched = "1";
        // A hidden input never fires "input" on its own; the validator listens
        // for it, so raise it by hand.
        country.dispatchEvent(new Event("input", { bubbles: true }));
      },
    });

    if (dialRows.length) codeMenu.select(dialRows[0].iso);

    var fields = [
      {
        wrap: "dl-f-name",
        el: document.getElementById("dl-name"),
        ok: (value) => value.trim().length > 0,
      },
      {
        wrap: "dl-f-email",
        el: document.getElementById("dl-email"),
        ok: (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()),
      },
      {
        wrap: "dl-f-phone",
        el: document.getElementById("dl-phone"),
        ok: (value) => value.trim().length >= 5,
      },
      {
        wrap: "dl-f-linkedin",
        el: document.getElementById("dl-linkedin"),
        ok: (value) =>
          /^(https?:\/\/)?([\w-]+\.)?linkedin\.com\/.+/i.test(value.trim()),
      },
      { wrap: "dl-f-country", el: country, ok: (value) => value.length > 0 },
    ];

    function fieldValid(field) {
      return field.ok(field.el.value);
    }
    function formValid() {
      return fields.every(fieldValid);
    }
    function paint(field, force) {
      var wrap = document.getElementById(field.wrap);
      if (force || wrap.dataset.touched === "1") {
        wrap.classList.toggle("invalid", !fieldValid(field));
      }
    }
    function refreshButton() {
      var valid = formValid();
      submit.disabled = !valid;
      submit.classList.toggle("btn-disabled", !valid);
    }

    fields.forEach((field) => {
      field.el.addEventListener("input", () => {
        paint(field, false);
        refreshButton();
      });
      field.el.addEventListener("blur", () => {
        document.getElementById(field.wrap).dataset.touched = "1";
        paint(field, false);
      });
    });
    refreshButton();

    // Both failures the visitor can see come from the page's own translations,
    // through the one mechanism. The busy message is reserved for the case the
    // transport marks rate-limited (no sink stored the lead and the gateway
    // answered 429), because waiting a moment is something the visitor can act
    // on; every other failure gets the generic one.
    function showError(rateLimited) {
      formError.textContent = rateLimited
        ? tr(
            "gate.formErrorBusy",
            "Too many attempts. Please wait a moment and try again.",
          )
        : tr("gate.formError", "Something went wrong. Please try again.");
      formError.hidden = false;
    }

    function resetSubmit() {
      submit.textContent = tr("gate.submit", "Continue to download");
      submit.disabled = false;
      submit.classList.remove("btn-disabled");
    }

    // Which entry point opened the modal (`data-dl-source`), read at submit
    // time because one page opens the gate from several of them.
    function leadSource() {
      return typeof opts.source === "function" ? opts.source() : opts.source;
    }

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      formError.hidden = true;
      fields.forEach((field) => {
        document.getElementById(field.wrap).dataset.touched = "1";
        paint(field, true);
      });
      if (!formValid()) return;
      submit.textContent = tr("gate.preparing", "Preparing your download…");
      submit.disabled = true;
      submit.classList.add("btn-disabled");
      var payload = {
        name: fields[0].el.value.trim(),
        email: fields[1].el.value.trim(),
        phone: `${phoneCode.value} ${fields[2].el.value.trim()}`,
        phoneCode: phoneCode.value,
        linkedin: fields[3].el.value.trim(),
        country: fields[4].el.value,
        source: leadSource(),
      };
      // download-gate-lead.js is where the lead goes (the gateway and the
      // mirrors together). Without it there is nowhere to register the visitor,
      // so the gate fails closed exactly as it does when no sink stored it.
      var delivery = window.HoustonDLLead
        ? window.HoustonDLLead.submit(opts.config, payload)
        : Promise.reject(new Error("lead transport missing"));
      // Two different failures, two different answers. A delivery that failed
      // leaves the visitor unregistered, so the form comes back with the
      // message. Everything after it — analytics, showing the download step —
      // runs on a lead that IS stored: a throw there is ours to look at, and
      // telling the visitor to try again would cost them the download they
      // already earned.
      delivery.then(
        () => {
          try {
            opts.onSubmitted(payload);
          } catch (error) {
            window.console?.warn(
              "Download gate post-submit step failed:",
              error,
            );
          }
        },
        (error) => {
          resetSubmit();
          showError(Boolean(error?.rateLimited));
        },
      );
    });
  }

  window.HoustonDLForm = { init: init };
})();
