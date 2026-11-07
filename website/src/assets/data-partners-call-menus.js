// The "Book a call" popup's two country menus: the country field and the
// dial code beside the phone number. They are the download form's own
// searchable menus (download-gate-dropdown.js) over the same country table
// (download-gate-countries.js), so the two forms list countries the same way.
//
// Picking a country also picks its dial code, until the visitor chooses a
// dial code themselves.

const rowHtml = (row, withDial) =>
  `<span class="dl-dd-flag">${row.flag}</span>` +
  `<span class="dl-dd-name">${row.display}</span>` +
  (withDial ? `<span class="dl-dd-dial">${row.dial}</span>` : "");

const byId = (id) => document.getElementById(id);

// Returns null when the shared menu assets did not load: the page then keeps
// its plain calendar links instead of a popup that could never send.
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
  // True while the script itself picks a dial code, so only the visitor's own
  // picks count as chosen.
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

  // The dial codes lead with the United States, then follow the country order.
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

  // The stored value stays the English name, as the download form stores it.
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
