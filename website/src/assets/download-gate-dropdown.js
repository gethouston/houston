// Searchable listbox shared by the download gate's country-code and country
// menus. The menu is fixed-positioned so it escapes the modal card's scroll
// clipping, and carries data-lenis-prevent so wheel events over it never reach
// the landing's smooth-scroll instance.
(() => {
  var DIACRITICS = /[\u0300-\u036f]/g;
  var UNSAFE_ID = /[^A-Za-z0-9_-]/g;

  function normalize(text) {
    return String(text == null ? "" : text)
      .normalize("NFD")
      .replace(DIACRITICS, "")
      .toLowerCase();
  }

  function flagOf(iso) {
    return iso
      .toUpperCase()
      .replace(/./g, (ch) => String.fromCodePoint(127397 + ch.charCodeAt(0)));
  }

  // Enriches the shared country table ([english, iso, dial]) with a
  // locale-aware display name so both gate menus render the same rows.
  function countryRows(entries, locale) {
    var tag = locale || "en";
    var names = null;
    try {
      names = new Intl.DisplayNames([tag], { type: "region" });
    } catch (_error) {}
    var rows = (entries || []).map((entry) => {
      var display = entry[0];
      if (names) {
        try {
          const localized = names.of(entry[1]);
          if (localized && localized !== entry[1]) display = localized;
        } catch (_error) {}
      }
      return {
        iso: entry[1],
        english: entry[0],
        display: display,
        dial: entry[2],
        flag: flagOf(entry[1]),
        haystack: normalize(`${display} ${entry[0]} ${entry[1]}`),
      };
    });
    return rows.sort((a, b) => a.display.localeCompare(b.display, tag));
  }

  function create(opts) {
    var root = opts.root;
    var toggle = opts.toggle;
    var menu = opts.menu;
    var list = opts.list;
    var search = opts.search || null;
    var empty = opts.empty || null;
    var items = [];
    var shown = [];
    var selectedId = null;
    var activeIndex = -1;
    var opened = false;
    var typed = "";
    var typedAt = 0;

    menu.setAttribute("data-lenis-prevent", "");
    toggle.setAttribute("aria-haspopup", "listbox");
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-controls", menu.id);
    list.setAttribute("role", "listbox");
    if (search) {
      search.setAttribute("role", "combobox");
      search.setAttribute("aria-autocomplete", "list");
      search.setAttribute("aria-expanded", "false");
      search.setAttribute("aria-controls", list.id);
    } else {
      menu.setAttribute("tabindex", "-1");
    }

    function focusTarget() {
      return search || menu;
    }

    function setActive(index, scroll) {
      activeIndex = index;
      Array.prototype.forEach.call(list.children, (node, i) => {
        node.classList.toggle("is-active", i === index);
      });
      var active = index > -1 ? list.children[index] : null;
      if (!active) {
        focusTarget().removeAttribute("aria-activedescendant");
        return;
      }
      focusTarget().setAttribute("aria-activedescendant", active.id);
      if (scroll) active.scrollIntoView({ block: "nearest" });
    }

    function markSelected() {
      Array.prototype.forEach.call(list.children, (node) => {
        var on = node.dataset.id === String(selectedId);
        node.classList.toggle("selected", on);
        node.setAttribute("aria-selected", on ? "true" : "false");
      });
    }

    function render() {
      var query = search ? normalize(search.value.trim()) : "";
      shown = query
        ? items.filter((item) => item.search.indexOf(query) > -1)
        : items.slice();
      list.textContent = "";
      shown.forEach((item) => {
        var node = document.createElement("li");
        node.className = "dl-dd-item";
        node.id = `${list.id}-${String(item.id).replace(UNSAFE_ID, "-")}`;
        node.dataset.id = String(item.id);
        node.setAttribute("role", "option");
        node.innerHTML = item.html;
        // Keep the search input focused when a row is picked with the mouse.
        node.addEventListener("mousedown", (event) => event.preventDefault());
        node.addEventListener("click", () => apply(item, true));
        list.appendChild(node);
      });
      markSelected();
      if (empty) empty.hidden = shown.length > 0;
      list.scrollTop = 0;
      setActive(shown.length ? 0 : -1, false);
    }

    // Follows the toggle instead of closing when the viewport moves.
    var anchor = window.HoustonDropdownAnchor.create({
      toggle: toggle,
      menu: menu,
      menuWidth: opts.menuWidth,
      isOpen: () => opened,
      onDetached: () => close(),
    });

    function onDocumentClick(event) {
      if (!root.contains(event.target)) close();
    }

    function open() {
      if (opened) return;
      opened = true;
      root.classList.add("open");
      toggle.setAttribute("aria-expanded", "true");
      if (search) {
        search.value = "";
        search.setAttribute("aria-expanded", "true");
      }
      render();
      anchor.position();
      // preventScroll keeps iOS from scrolling the document to reveal the
      // search box, which would immediately drag the anchor out from under us.
      focusTarget().focus({ preventScroll: true });
      document.addEventListener("click", onDocumentClick);
      anchor.bind(true);
      // The keyboard animates in after focus; re-place once it has settled.
      anchor.sync();
    }

    function close() {
      if (!opened) return;
      opened = false;
      activeIndex = -1;
      root.classList.remove("open");
      toggle.setAttribute("aria-expanded", "false");
      if (search) search.setAttribute("aria-expanded", "false");
      focusTarget().removeAttribute("aria-activedescendant");
      document.removeEventListener("click", onDocumentClick);
      anchor.bind(false);
    }

    // fromUi selections dismiss the menu and hand focus back to the toggle;
    // a programmatic select() only records the choice.
    function apply(item, fromUi) {
      selectedId = item.id;
      markSelected();
      if (fromUi) {
        close();
        toggle.focus();
      }
      if (opts.onSelect) opts.onSelect(item);
    }

    function select(id) {
      items.forEach((item) => {
        if (String(item.id) === String(id)) apply(item, false);
      });
    }

    function setItems(next) {
      items = (next || []).map((item) => ({
        id: item.id,
        value: item.value,
        label: item.label,
        html: item.html,
        search: normalize(item.search || item.label),
      }));
      if (opened) render();
    }

    function typeahead(key) {
      var now = Date.now();
      typed = now - typedAt > 900 ? key : typed + key;
      typedAt = now;
      var needle = normalize(typed);
      for (let i = 0; i < shown.length; i++) {
        if (shown[i].search.indexOf(needle) === 0) {
          setActive(i, true);
          return;
        }
      }
    }

    function step(delta) {
      if (!shown.length) return;
      var next = activeIndex + delta;
      if (next < 0) next = shown.length - 1;
      if (next >= shown.length) next = 0;
      setActive(next, true);
    }

    toggle.addEventListener("click", (event) => {
      event.preventDefault();
      if (opened) close();
      else open();
    });
    if (search) {
      search.addEventListener("input", () => {
        render();
        anchor.position();
      });
    }
    root.addEventListener("keydown", (event) => {
      if (!opened) return;
      var key = event.key;
      if (key === "Escape") {
        // Escape belongs to the menu, not the modal that hosts it.
        event.preventDefault();
        event.stopPropagation();
        close();
        toggle.focus();
      } else if (key === "ArrowDown" || key === "ArrowUp") {
        event.preventDefault();
        step(key === "ArrowDown" ? 1 : -1);
      } else if (key === "Home" || key === "End") {
        event.preventDefault();
        const last = shown.length - 1;
        if (shown.length) setActive(key === "Home" ? 0 : last, true);
      } else if (key === "Enter") {
        event.preventDefault();
        if (shown[activeIndex]) apply(shown[activeIndex], true);
      } else if (key === "Tab") {
        close();
      } else if (!search && key.length === 1) {
        typeahead(key);
      }
    });

    setItems(opts.items);

    return {
      open: open,
      close: close,
      isOpen: () => opened,
      select: select,
      setItems: setItems,
    };
  }

  window.HoustonDropdown = { create: create, countryRows: countryRows };
})();
