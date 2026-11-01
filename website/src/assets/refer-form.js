// The /data-partners/refer form: checks the fields with refer-model.js,
// shows each error under its field, and stores a valid referral through
// refer-send.js, then swaps the form for the "received" panel. When it cannot
// be stored, it opens the visitor's email app with everything filled in and
// shows the "ready to send" panel instead. Without JS the form posts the raw
// fields to the program inbox (its mailto action).

import {
  CHECKS,
  composeMail,
  FIELDS,
  referralRow,
  validate,
} from "./refer-model.js";
import { sendReferral } from "./refer-send.js";

const form = document.querySelector("[data-refer-form]");
const done = document.getElementById("rf-done");
const copyNode = document.getElementById("rf-copy");

if (form && done && copyNode) {
  // The request titles, in the page's language, from the request picker.
  const copy = {
    ...JSON.parse(copyNode.textContent),
    listings: Object.fromEntries(
      Array.from(form.elements.listing?.options ?? [])
        .filter((option) => option.value)
        .map((option) => [option.value, option.textContent]),
    ),
  };
  const sizes = Array.from(form.elements.size.options)
    .map((option) => option.value)
    .filter(Boolean);
  let tried = false;

  const submit = form.querySelector('[type="submit"]');
  const submitLabel = submit.textContent;

  const values = () => ({
    ...Object.fromEntries(
      FIELDS.map((name) => [name, form.elements[name]?.value ?? ""]),
    ),
    ...Object.fromEntries(
      CHECKS.map((name) => [name, form.elements[name]?.checked === true]),
    ),
  });

  const show = (errors) => {
    for (const name of [...FIELDS, ...CHECKS]) {
      const input = form.elements[name];
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
  form.addEventListener("input", () => {
    if (tried) show(validate(values(), sizes));
  });

  const finish = (outcome) => {
    for (const panel of done.querySelectorAll("[data-done]"))
      panel.hidden = panel.dataset.done !== outcome;
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
    const input = values();
    const errors = validate(input, sizes);
    show(errors);
    const first = [...FIELDS, ...CHECKS].find((name) => errors[name]);
    if (first) {
      form.elements[first].focus();
      return;
    }
    // A filled trap is a bot: it sees success, nothing is stored.
    if (form.elements.trap?.value) {
      finish("stored");
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
      finish("stored");
      return;
    }
    const mail = composeMail(input, copy);
    const fallback = done.querySelector("[data-done-mail]");
    if (fallback) fallback.href = mail.href;
    window.location.href = mail.href;
    finish("mail");
  });

  // Another referral from the same person: only the company and the contact
  // start over.
  done.querySelector("[data-again]")?.addEventListener("click", () => {
    const { yourName, yourEmail } = form.elements;
    const keep = [yourName.value, yourEmail.value, form.elements.listing.value];
    form.reset();
    [yourName.value, yourEmail.value, form.elements.listing.value] = keep;
    tried = false;
    show({});
    done.hidden = true;
    form.hidden = false;
    form.elements.companyName.focus();
  });
}
