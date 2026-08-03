(() => {
  function flagOf(iso) {
    return iso
      .toUpperCase()
      .replace(/./g, (ch) => String.fromCodePoint(127397 + ch.charCodeAt(0)));
  }

  function init(opts) {
    var countries = window.HOUSTON_COUNTRIES || [];
    var form = document.getElementById("dl-form");
    var submit = document.getElementById("dl-submit");
    var formError = document.getElementById("dl-form-err");
    var country = document.getElementById("dl-country");
    var cc = document.getElementById("dl-cc");
    var ccToggle = document.getElementById("dl-cc-toggle");
    var ccMenu = document.getElementById("dl-cc-menu");
    var ccFlag = document.getElementById("dl-cc-flag");
    var ccAbbr = document.getElementById("dl-cc-abbr");
    var ccDial = document.getElementById("dl-cc-dial");
    var phoneCode = document.getElementById("dl-phone-code");
    if (!form || !submit || !country || !cc || !ccToggle || !ccMenu) return;

    var sorted = countries.slice().sort((a, b) => a[0].localeCompare(b[0]));
    var dialCodes = sorted.slice();
    var usIndex = -1;
    dialCodes.forEach((entry, index) => {
      if (entry[1] === "US") usIndex = index;
    });
    if (usIndex > -1) dialCodes.unshift(dialCodes.splice(usIndex, 1)[0]);

    sorted.forEach((entry) => {
      var option = document.createElement("option");
      option.value = entry[0];
      option.textContent = entry[0];
      country.appendChild(option);
    });

    function selectCode(entry) {
      ccFlag.textContent = flagOf(entry[1]);
      ccAbbr.textContent = entry[1];
      ccDial.textContent = entry[2];
      phoneCode.value = entry[2];
      Array.prototype.forEach.call(ccMenu.children, (item) => {
        item.classList.toggle("selected", item.dataset.iso === entry[1]);
      });
    }

    function closeCC() {
      cc.classList.remove("open");
      ccToggle.setAttribute("aria-expanded", "false");
    }

    dialCodes.forEach((entry) => {
      var item = document.createElement("li");
      item.className = "dl-cc-item";
      item.setAttribute("role", "option");
      item.dataset.iso = entry[1];
      item.title = entry[0];
      item.innerHTML =
        '<span class="dl-cc-flag">' +
        flagOf(entry[1]) +
        '</span><span class="dl-cc-name">' +
        entry[0] +
        '</span><span class="dl-cc-dial">' +
        entry[2] +
        "</span>";
      item.addEventListener("click", () => {
        selectCode(entry);
        closeCC();
      });
      ccMenu.appendChild(item);
    });

    function openCC() {
      // Fixed positioning avoids clipping inside the scrolling modal card.
      var rect = ccToggle.getBoundingClientRect();
      ccMenu.style.top = `${rect.bottom + 6}px`;
      ccMenu.style.left = `${rect.left}px`;
      ccMenu.scrollTop = 0;
      cc.classList.add("open");
      ccToggle.setAttribute("aria-expanded", "true");
    }

    ccToggle.addEventListener("click", (event) => {
      event.stopPropagation();
      cc.classList.contains("open") ? closeCC() : openCC();
    });
    document.addEventListener("click", (event) => {
      if (!cc.contains(event.target)) closeCC();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeCC();
    });
    window.addEventListener(
      "scroll",
      (event) => {
        if (
          event.target &&
          event.target.nodeType === 1 &&
          ccMenu.contains(event.target)
        )
          return;
        closeCC();
      },
      true,
    );
    window.addEventListener("resize", closeCC);
    if (dialCodes.length) selectCode(dialCodes[0]);

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
      var eventName = field.el.tagName === "SELECT" ? "change" : "input";
      field.el.addEventListener(eventName, () => {
        paint(field, false);
        refreshButton();
      });
      field.el.addEventListener("blur", () => {
        document.getElementById(field.wrap).dataset.touched = "1";
        paint(field, false);
      });
    });
    refreshButton();

    function sendSignup(payload) {
      var config = opts.config || {};
      return fetch(`${config.supabaseUrl}/rest/v1/waitlist`, {
        method: "POST",
        headers: {
          apikey: config.supabaseAnonKey,
          Authorization: `Bearer ${config.supabaseAnonKey}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({
          full_name: payload.name,
          email: payload.email,
          phone: payload.phone,
          phone_country_code: payload.phoneCode,
          linkedin: payload.linkedin,
          country: payload.country,
          source: "download_gate",
        }),
      }).then((response) => {
        if (!response.ok && response.status !== 409) {
          throw new Error(`Supabase insert failed: ${response.status}`);
        }
        if (config.sheetEndpoint) {
          fetch(config.sheetEndpoint, {
            method: "POST",
            mode: "no-cors",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify(payload),
          }).catch((error) => {
            console.warn("Sheet mirror write failed:", error);
          });
        }
      });
    }

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      formError.hidden = true;
      fields.forEach((field) => {
        document.getElementById(field.wrap).dataset.touched = "1";
        paint(field, true);
      });
      if (!formValid()) return;
      submit.textContent = "Preparing your download…";
      submit.disabled = true;
      submit.classList.add("btn-disabled");
      var payload = {
        name: fields[0].el.value.trim(),
        email: fields[1].el.value.trim(),
        phone: `${phoneCode.value} ${fields[2].el.value.trim()}`,
        phoneCode: phoneCode.value,
        linkedin: fields[3].el.value.trim(),
        country: fields[4].el.value,
        source: "download_gate",
      };
      sendSignup(payload)
        .then(() => {
          opts.onSubmitted(payload);
        })
        .catch(() => {
          submit.textContent = "Continue to download";
          submit.disabled = false;
          submit.classList.remove("btn-disabled");
          formError.hidden = false;
        });
    });
  }

  window.HoustonDLForm = { init: init };
})();
