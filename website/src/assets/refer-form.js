// The /data-partners/refer form: checks the fields with refer-model.js,
// shows each error under its field, and on a valid referral opens the
// visitor's email app with everything filled in, then swaps the form for
// the "ready to send" panel. Without JS the form posts the raw fields to
// the same inbox (its mailto action).

import { composeMail, FIELDS, validate } from "./refer-model.js";

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

  const values = () =>
    Object.fromEntries(
      FIELDS.map((name) => [name, form.elements[name]?.value ?? ""]),
    );

  const show = (errors) => {
    for (const name of FIELDS) {
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

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    tried = true;
    const errors = validate(values(), sizes);
    show(errors);
    const first = FIELDS.find((name) => errors[name]);
    if (first) {
      form.elements[first].focus();
      return;
    }
    const mail = composeMail(values(), copy);
    const fallback = done.querySelector("[data-done-mail]");
    if (fallback) fallback.href = mail.href;
    window.location.href = mail.href;
    form.hidden = true;
    done.hidden = false;
    done.focus();
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
