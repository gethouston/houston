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
    clear: () => {
      input.value = "";
      show("");
    },
  };
}
