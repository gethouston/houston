(() => {
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
      var delivery = window.HoustonDLLead
        ? window.HoustonDLLead.submit(opts.config, payload)
        : Promise.reject(new Error("lead transport missing"));
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
