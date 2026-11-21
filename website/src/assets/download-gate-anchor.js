(() => {
  function viewportBox() {
    var vv = window.visualViewport;
    if (!vv) {
      return {
        top: 0,
        left: 0,
        width: window.innerWidth,
        height: window.innerHeight,
      };
    }
    return {
      top: vv.offsetTop,
      left: vv.offsetLeft,
      width: vv.width,
      height: vv.height,
    };
  }

  function create(opts) {
    var toggle = opts.toggle;
    var menu = opts.menu;
    var queued = false;

    function position() {
      var placement = window.HoustonDropdownPlacement;
      var anchor = toggle.getBoundingClientRect();
      var view = viewportBox();
      var box = placement.fit(anchor, view, opts.menuWidth);
      menu.style.width = `${box.width}px`;
      menu.style.maxHeight = `${box.maxHeight}px`;
      var spot = placement.place(
        anchor,
        view,
        opts.menuWidth,
        menu.offsetHeight,
      );
      menu.style.top = `${spot.top}px`;
      menu.style.left = `${spot.left}px`;
    }

    function sync() {
      if (queued) return;
      queued = true;
      window.requestAnimationFrame(() => {
        queued = false;
        if (!opts.isOpen()) return;
        var anchor = toggle.getBoundingClientRect();
        if (!anchor.width && !anchor.height) {
          opts.onDetached();
          return;
        }
        position();
      });
    }

    function onScroll(event) {
      var target = event.target;
      var node = target && target.nodeType === 1 ? target : null;
      if (node && menu.contains(node)) return;
      sync();
    }

    function bind(add) {
      var method = add ? "addEventListener" : "removeEventListener";
      window[method]("scroll", onScroll, true);
      window[method]("resize", sync);
      if (window.visualViewport) {
        window.visualViewport[method]("resize", sync);
        window.visualViewport[method]("scroll", sync);
      }
    }

    return { position: position, sync: sync, bind: bind };
  }

  window.HoustonDropdownAnchor = { create: create };
})();
