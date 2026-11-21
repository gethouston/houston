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
    const done = () => {
      if (qualified) window.location.assign(bookingUrl(config.booking, input));
      else show("thanks");
    };
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
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) reset();
  });
  byId("dpc-close").addEventListener("click", close);
  for (const node of overlay.querySelectorAll("[data-dpc-close]")) {
    node.addEventListener("click", close);
  }
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
