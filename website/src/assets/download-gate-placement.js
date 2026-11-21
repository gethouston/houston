(() => {
  var GUTTER = 8;
  var OFFSET = 6;
  var MIN_HEIGHT = 132;
  var MAX_HEIGHT = 360;

  function clamp(value, min, max) {
    return max < min ? min : Math.min(Math.max(value, min), max);
  }

  function fit(anchor, view, preferredWidth) {
    var width = Math.min(
      preferredWidth || Math.max(Math.round(anchor.width), 260),
      Math.max(120, view.width - GUTTER * 2),
    );
    var viewTop = view.top + GUTTER;
    var viewBottom = view.top + view.height - GUTTER;
    var below = viewBottom - (anchor.bottom + OFFSET);
    var above = anchor.top - OFFSET - viewTop;
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
