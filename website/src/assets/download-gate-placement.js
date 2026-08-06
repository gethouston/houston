// Placement math for the download gate's fixed-position dropdown menus.
// Split out of download-gate-dropdown.js so it stays pure (numbers in, numbers
// out) and can be unit-tested without a DOM — see test/placement.test.mjs.
//
// Coordinates are layout-viewport pixels, the space `position: fixed` and
// getBoundingClientRect() both speak. On mobile the *visual* viewport is the
// part the user can actually see (the software keyboard covers the rest), so
// callers pass it in and the menu is clamped to it. Without that clamp the
// menu is happily positioned underneath the keyboard and the country the user
// wants is unreachable.
(() => {
  var GUTTER = 8; // breathing room against the viewport edges
  var OFFSET = 6; // gap between the toggle and the menu
  var MIN_HEIGHT = 132; // never squash below ~3 rows; overlap the anchor first
  var MAX_HEIGHT = 360; // matches .dl-dd-menu's CSS ceiling

  function clamp(value, min, max) {
    // A viewport smaller than the menu can invert the bounds; min wins.
    return max < min ? min : Math.min(Math.max(value, min), max);
  }

  // anchor: the toggle's bounding rect ({top, bottom, left, width}).
  // view:   the visual viewport ({top, left, width, height}), where top/left
  //         are its offset inside the layout viewport.
  // Returns the width/max-height to apply before measuring, then place() is
  // called again with the measured height to get the final top/left.
  function fit(anchor, view, preferredWidth) {
    var width = Math.min(
      preferredWidth || Math.max(Math.round(anchor.width), 260),
      Math.max(120, view.width - GUTTER * 2),
    );
    var viewTop = view.top + GUTTER;
    var viewBottom = view.top + view.height - GUTTER;
    var below = viewBottom - (anchor.bottom + OFFSET);
    var above = anchor.top - OFFSET - viewTop;
    // Flip up only when below cannot hold a usable menu and above is roomier.
    var placeAbove = below < MIN_HEIGHT && above > below;
    var room = Math.max(placeAbove ? above : below, MIN_HEIGHT);
    return {
      width: Math.round(width),
      maxHeight: Math.round(Math.min(room, MAX_HEIGHT)),
      placeAbove: placeAbove,
    };
  }

  function place(anchor, view, preferredWidth, measuredHeight) {
    var box = fit(anchor, view, preferredWidth);
    var height = Math.min(measuredHeight, box.maxHeight);
    var viewTop = view.top + GUTTER;
    var viewBottom = view.top + view.height - GUTTER;
    var top = box.placeAbove
      ? anchor.top - OFFSET - height
      : anchor.bottom + OFFSET;
    var left = anchor.left;
    return {
      width: box.width,
      maxHeight: box.maxHeight,
      placeAbove: box.placeAbove,
      top: Math.round(clamp(top, viewTop, viewBottom - height)),
      left: Math.round(
        clamp(
          left,
          view.left + GUTTER,
          view.left + view.width - box.width - GUTTER,
        ),
      ),
    };
  }

  var api = { fit: fit, place: place, MIN_HEIGHT: MIN_HEIGHT };
  if (typeof window !== "undefined") window.HoustonDropdownPlacement = api;
  if (typeof globalThis !== "undefined")
    globalThis.HoustonDropdownPlacement = api;
})();
