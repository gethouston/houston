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
