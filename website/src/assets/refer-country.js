// The referral form's country field: the "Book a call" popup's searchable
// menu (data-partners-call-menus.js) over the same country table, so every
// Data Partners form lists countries the same way. The menu writes the English
// name into the hidden `country` input, as the other forms store it.
//
// Returns null when the shared menu assets did not load. The field then stays
// empty and the form says so under it rather than sending without a country.

const byId = (id) => document.getElementById(id);

export function createCountryField({ locale, onChange }) {
  const dropdowns = window.HoustonDropdown;
  if (!dropdowns || !window.HoustonDropdownAnchor) {
    globalThis.console?.warn(
      "Referral country menu off: dropdown assets missing",
    );
    return null;
  }
  const rows = dropdowns.countryRows(window.HOUSTON_COUNTRIES || [], locale);
  if (!rows.length) return null;

  const input = byId("rf-country");
  const value = byId("rf-country-value");
  const show = (label) => {
    value.textContent = label || value.dataset.placeholder;
    value.classList.toggle("is-placeholder", !label);
  };

  // The menu is fixed-positioned, and a transformed ancestor (the fold's
  // hero-load entrance, a request page's .reveal) would hold and clip it. By
  // the time the visitor reaches for the menu the entrance has played, so its
  // wrappers drop the transform first (refer-form.css .rf-settled). Runs
  // before the dropdown's own handlers, which measure where to hang it.
  const root = byId("rf-country-dd");
  const settle = () => {
    for (let node = root.parentElement; node; node = node.parentElement) {
      if (node.matches(".hero-load, .reveal")) node.classList.add("rf-settled");
    }
  };
  root.addEventListener("pointerdown", settle, { once: true });
  root.addEventListener("focusin", settle, { once: true });

  dropdowns.create({
    root,
    toggle: byId("rf-country-toggle"),
    menu: byId("rf-country-menu"),
    list: byId("rf-country-list"),
    search: byId("rf-country-search"),
    empty: byId("rf-country-empty"),
    items: rows.map((row) => ({
      id: row.iso,
      value: row.english,
      label: row.display,
      search: row.haystack,
      html:
        `<span class="dl-dd-flag">${row.flag}</span>` +
        `<span class="dl-dd-name">${row.display}</span>`,
    })),
    onSelect: (item) => {
      input.value = item.value;
      show(item.label);
      onChange();
    },
  });

  return {
    toggle: byId("rf-country-toggle"),
    // A hidden input keeps its value through form.reset(), so starting over
    // clears it by hand.
    clear: () => {
      input.value = "";
      show("");
    },
  };
}
