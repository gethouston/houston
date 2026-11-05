// The /data-partners "Book a call" popup (data-partners/call-modal.njk): every
// [data-call-trigger] link opens it instead of the calendar. The form is
// checked with data-partners-call-model.js and stored through
// data-partners-call-send.js. Once stored, a company at the program's bar is
// taken straight to the calendar, in this tab, with its name and email filled
// in; anyone else is thanked, and the team follows up. Same tab on purpose: a
// new tab opened after the wait for the database is blocked as a popup.
//
// The links keep their calendar href, and are only taken over once the popup
// is fully set up, so a page where this or the shared menus failed to load
// still books calls.

import { createMenus } from "./data-partners-call-menus.js";
import {
  bookingUrl,
  callRow,
  FIELDS,
  qualifies,
  validate,
} from "./data-partners-call-model.js";
import { sendCall } from "./data-partners-call-send.js";

const byId = (id) => document.getElementById(id);
const overlay = byId("dpc-overlay");
const configNode = byId("dpc-config");
const form = byId("dpc-form");

function track(name, props) {
  if (typeof window.track === "function") window.track(name, props);
}

// The download popup's scroll lock (download-gate.js): the same class, and
// Lenis stopped so a wheel over the card never scrolls the page.
let savedY = 0;
function lockScroll() {
  const root = document.documentElement;
  if (root.classList.contains("dl-modal-open")) return;
  savedY = window.scrollY;
  const gutter = window.innerWidth - root.clientWidth;
  root.style.setProperty("--dl-sbw", `${gutter}px`);
  window.lenis?.stop?.();
  root.classList.add("dl-modal-open");
}
function unlockScroll() {
  document.documentElement.classList.remove("dl-modal-open");
  if (window.lenis?.start) {
    window.lenis.start();
    window.lenis.scrollTo(savedY, { immediate: true });
  } else {
    window.scrollTo(0, savedY);
  }
}

function setUp(config, menus) {
  const submit = byId("dpc-submit");
  const submitLabel = submit.textContent;
  const formError = byId("dpc-form-err");
  const steps = {
    form: byId("dpc-step-form"),
    thanks: byId("dpc-step-thanks"),
  };
  let source = "unknown";
  let opener = null;
  let sending = false;

  const values = () => ({
    ...Object.fromEntries(FIELDS.map((k) => [k, form.elements[k].value])),
    phoneCode: form.elements.phoneCode.value,
  });
  const wrap = (name) => byId(`dpc-f-${name}`);

  // A field shows its error once the visitor has left it, or tried to send.
  function paint(force) {
    const errors = validate(values());
    for (const name of FIELDS) {
      const field = wrap(name);
      if (force) field.dataset.touched = "1";
      const bad = field.dataset.touched === "1" && Boolean(errors[name]);
      field.classList.toggle("invalid", bad);
      const input = form.elements[name];
      if (bad) input.setAttribute("aria-invalid", "true");
      else input.removeAttribute("aria-invalid");
    }
    const valid = Object.keys(errors).length === 0;
    submit.disabled = !valid || sending;
    submit.classList.toggle("btn-disabled", !valid || sending);
    return errors;
  }

  form.addEventListener("input", () => paint(false));
  form.addEventListener("focusout", (event) => {
    const name = event.target.name;
    if (FIELDS.includes(name)) wrap(name).dataset.touched = "1";
    paint(false);
  });

  const show = (name) => {
    for (const [key, node] of Object.entries(steps)) node.hidden = key !== name;
    if (name !== "form") steps[name].focus();
  };

  // Opening again after sending shows the thanks already given: the request
  // is stored.
  function open(from, trigger) {
    source = from || "unknown";
    opener = trigger;
    overlay.classList.add("open");
    lockScroll();
    track("data_partner_call_opened", { source });
    const target = steps.form.hidden
      ? Object.values(steps).find((node) => !node.hidden)
      : form.elements.name;
    window.setTimeout(() => target.focus(), 200);
  }

  function close() {
    if (!overlay.classList.contains("open")) return;
    overlay.classList.remove("open");
    unlockScroll();
    opener?.focus();
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    formError.hidden = true;
    const input = values();
    const errors = paint(true);
    const first = FIELDS.find((name) => errors[name]);
    if (first) {
      const country = first === "country";
      (country ? byId("dpc-country-toggle") : form.elements[first]).focus();
      return;
    }
    const qualified = qualifies(input.employees);
    // The button keeps saying "Sending" while the calendar loads.
    const done = () => {
      if (qualified) window.location.assign(bookingUrl(config.booking, input));
      else show("thanks");
    };
    // A filled trap is a bot: it sees success, nothing is stored.
    if (form.elements.trap.value) return done();
    sending = true;
    paint(false);
    submit.textContent = submit.dataset.sending;
    const row = callRow(input, {
      locale: config.locale,
      page: window.location.pathname,
      source,
    });
    const outcome = await sendCall(row, config.store);
    if (outcome !== "stored") {
      reset();
      formError.hidden = false;
      submit.focus();
      return;
    }
    track("data_partner_call_requested", { source, qualified });
    done();
  });

  function reset() {
    sending = false;
    submit.textContent = submitLabel;
    paint(false);
  }
  // Back from the calendar, the browser may restore this page as it was left:
  // mid-send. The request is stored; the form is usable again.
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) reset();
  });
  byId("dpc-close").addEventListener("click", close);
  for (const node of overlay.querySelectorAll("[data-dpc-close]")) {
    node.addEventListener("click", close);
  }
  // With a country menu open, the backdrop and Escape close only the menu (the
  // menu handles both), so a near miss never throws the filled form away.
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay && !menus.anyOpen()) close();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !menus.anyOpen()) close();
  });

  for (const trigger of document.querySelectorAll("[data-call-trigger]")) {
    trigger.addEventListener("click", (event) => {
      event.preventDefault();
      open(trigger.dataset.callTrigger, trigger);
    });
  }
  paint(false);
}

if (overlay && configNode && form) {
  const config = JSON.parse(configNode.textContent);
  const menus = createMenus({
    locale: config.locale,
    onCountry: () => {
      byId("dpc-f-country").dataset.touched = "1";
      form.dispatchEvent(new Event("input"));
    },
  });
  if (menus) setUp(config, menus);
}
