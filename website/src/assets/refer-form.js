// The /data-partners/refer form: checks the fields with refer-model.js,
// shows each error under its field, and stores a valid referral through
// refer-send.js, then swaps the form for the "received" panel. When it cannot
// be stored, the form stays as filled with a line saying so above the button,
// so the visitor can send again. Nothing is ever sent by email: the button
// ships disabled and is enabled here, so without JS the form sends nothing.

import { createCountryField } from "./refer-country.js";
import { FIELDS, referralRow, validate } from "./refer-model.js";
import { sendReferral } from "./refer-send.js";

const form = document.querySelector("[data-refer-form]");
const done = document.getElementById("rf-done");
const copyNode = document.getElementById("rf-copy");

if (form && done && copyNode) {
  const copy = JSON.parse(copyNode.textContent);
  const sendError = document.getElementById("rf-send-error");
  let tried = false;

  const submit = form.querySelector('[type="submit"]');
  const submitLabel = submit.textContent;
  submit.disabled = false;

  const values = () =>
    Object.fromEntries(
      FIELDS.map((name) => [name, form.elements[name]?.value ?? ""]),
    );

  // The country is a hidden input behind a menu button: the button is what
  // shows the error and takes focus.
  const countryToggle = document.getElementById("rf-country-toggle");
  const control = (name) =>
    name === "country" ? countryToggle : form.elements[name];

  const show = (errors) => {
    for (const name of FIELDS) {
      const input = control(name);
      const line = document.getElementById(`rf-${name}-error`);
      if (!input || !line) continue;
      const key = errors[name];
      line.hidden = !key;
      line.textContent = key ? copy.errors[key] : "";
      if (key) input.setAttribute("aria-invalid", "true");
      else input.removeAttribute("aria-invalid");
    }
  };

  // After the first attempt, errors clear as the visitor fixes them.
  const recheck = () => {
    if (tried) show(validate(values()));
  };
  form.addEventListener("input", recheck);
  const country = createCountryField({
    locale: copy.locale,
    onChange: recheck,
  });

  const finish = () => {
    form.hidden = true;
    done.hidden = false;
    done.focus();
  };

  const sending = (on) => {
    submit.disabled = on;
    submit.textContent = on ? submit.dataset.sending : submitLabel;
  };

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (submit.disabled) return;
    tried = true;
    sendError.hidden = true;
    const input = values();
    const errors = validate(input);
    show(errors);
    const first = FIELDS.find((name) => errors[name]);
    if (first) {
      control(first).focus();
      return;
    }
    // A filled trap is a bot: it sees success, nothing is stored.
    if (form.elements.trap?.value) {
      finish();
      return;
    }
    sending(true);
    const row = referralRow(input, {
      locale: copy.locale,
      page: window.location.pathname,
    });
    const outcome = await sendReferral(row, copy.store);
    sending(false);
    if (outcome === "stored") {
      finish();
      return;
    }
    sendError.textContent = copy.errors.send;
    sendError.hidden = false;
    submit.focus();
  });

  // Another referral from the same person: only the company starts over. The
  // reset puts back the page's own industry and request, if it has them.
  done.querySelector("[data-again]")?.addEventListener("click", () => {
    const { yourName, yourEmail, yourPhone } = form.elements;
    const keep = [yourName.value, yourEmail.value, yourPhone.value];
    form.reset();
    [yourName.value, yourEmail.value, yourPhone.value] = keep;
    country?.clear();
    tried = false;
    show({});
    done.hidden = true;
    form.hidden = false;
    form.elements.companyName.focus();
  });
}
