const rowHtml = (row, withDial) =>
  `<span class="dl-dd-flag">${row.flag}</span>` +
  `<span class="dl-dd-name">${row.display}</span>` +
  (withDial ? `<span class="dl-dd-dial">${row.dial}</span>` : "");

const byId = (id) => document.getElementById(id);

export function createMenus({ locale, onCountry }) {
  const dropdowns = window.HoustonDropdown;
  if (!dropdowns || !window.HoustonDropdownAnchor) return null;
  const rows = dropdowns.countryRows(window.HOUSTON_COUNTRIES || [], locale);
  if (!rows.length) return null;
  const byIso = Object.fromEntries(rows.map((row) => [row.iso, row]));

  const country = byId("dpc-country");
  const countryValue = byId("dpc-country-value");
  const phoneCode = byId("dpc-phone-code");
  let codePicked = false;
  let syncing = false;

  const menu = (prefix, root, items, onSelect, menuWidth) =>
    dropdowns.create({
      root: byId(root),
      toggle: byId(`${prefix}-toggle`),
      menu: byId(`${prefix}-menu`),
      list: byId(`${prefix}-list`),
      search: byId(`${prefix}-search`),
      empty: byId(`${prefix}-empty`),
      menuWidth,
      items,
      onSelect,
    });

  const dialRows = [
    ...rows.filter((row) => row.iso === "US"),
    ...rows.filter((row) => row.iso !== "US"),
  ];
  const showCode = (row) => {
    byId("dpc-cc-flag").textContent = row.flag;
    byId("dpc-cc-abbr").textContent = row.iso;
    byId("dpc-cc-dial").textContent = row.dial;
    phoneCode.value = row.dial;
  };
  const codeMenu = menu(
    "dpc-cc",
    "dpc-cc",
    dialRows.map((row) => ({
      id: row.iso,
      value: row.dial,
      label: row.display,
      search: `${row.haystack} ${row.dial}`,
      html: rowHtml(row, true),
    })),
    (item) => {
      showCode(byIso[item.id]);
      if (!syncing) codePicked = true;
    },
    290,
  );
  const syncCode = (iso) => {
    syncing = true;
    codeMenu.select(iso);
    syncing = false;
  };

  menu(
    "dpc-country",
    "dpc-country-dd",
    rows.map((row) => ({
      id: row.iso,
      value: row.english,
      label: row.display,
      search: row.haystack,
      html: rowHtml(row, false),
    })),
    (item) => {
      country.value = item.value;
      countryValue.textContent = item.label;
      countryValue.classList.remove("is-placeholder");
      if (!codePicked) syncCode(item.id);
      onCountry();
    },
  );

  syncCode(dialRows[0].iso);
  return {
    anyOpen: () => Boolean(document.querySelector("#dpc-overlay .dl-dd.open")),
  };
}
