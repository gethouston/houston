# ui/pdf: design decisions

Covers `ui/pdf/` (`@houston-ai/pdf`): the PDF viewer, its text layer, selection and comments.

## Paper is always light

Pages pin `data-theme="light"` because paper is light in every app theme, so tokens inside resolve light; crop colors are read from the page element for the same reason. The thumbnail ring's color is resolved on the button in the rail's theme and inherited. Lives in `ui/pdf/src/styles.css` and `ui/pdf/src/crop.ts`.

## pdf.js loading and worker

pdf.js (about 1.3 MB) loads on first use to stay out of the entry chunk. The legacy build is used because the modern one calls `Promise.withResolvers`, `Math.sumPrecise`, `Map.prototype.getOrInsert` and `Uint8Array.fromBase64` unpolyfilled, which the WebKit behind macOS 10.15 and iOS 15 lacks. The worker comes through Vite's `?worker` so it is bundled, down-levelled and served from the app's origin in Tauri, web and dev. One worker is owned here and handed to every document, because a worker pdf.js creates itself belongs to every document on it and closing one tears it down. A failed load is retryable on the next open. Lives in `ui/pdf/src/pdfjs.ts`.

## Text layer

The text layer is trimmed from pdf.js 6's viewer stylesheet to what selection needs, with width and height forced to the page box because pdf.js uses CSS `round()`, which older Android WebViews cannot parse. It is built at scale 1 and sized by `--total-scale-factor`, so zooming never rebuilds it. Lives in `ui/pdf/src/styles.css` and `ui/pdf/src/page-render.ts`.

## Canvas memory

WebKit refuses canvases past about 16.7M pixels, so rendering stays well under it, and every live canvas counts against one WebKit memory budget until collected, so removed canvases are emptied first. Pages near the viewport keep a canvas; others release pixels and text. A new document version (the agent rewrote the file) loads in the background, renders behind the old canvas and fades in; a failed reload keeps the old pages. Pages paint at page 1's size first while the rest are measured. Lives in `ui/pdf/src/page-render.ts`, `ui/pdf/src/pdf-page.tsx`, `ui/pdf/src/use-pdf-document.ts`, `ui/pdf/src/page-sizes.ts`, `ui/pdf/src/use-page-layout.ts`.

## Selection gestures

There is no mode switch: with mouse or pen, a drag starting on a word selects text and elsewhere draws an area; on touch, text keeps native long-press handles and a long press elsewhere then drag draws an area, while a long press without drag marks a default box. Zoom and resize keep the same point of the same page at the top of the viewport. The canvas is read for crops immediately because the page may unmount. Lives in `ui/pdf/src/use-selection-gestures.ts`, `ui/pdf/src/use-page-layout.ts`, `ui/pdf/src/pdf-pages.tsx`.

## Geometry and crops

Rects are stored in hundredths of a percent of the page. Text selections join per-span rects into one box per line. A crop shows the selection with page around it, at least 30% of the page wide and close to 16:10, so a one-line quote reads in context. The quick crop copies from the on-screen canvas for thumbnails; the agent's crop is re-rendered by pdf.js at a fixed long side so body text is readable. Area pins straddle the top-left corner; text pins avoid covering the quoted words and other text, trying beside the first line, the margins, then above and below. Only pins take pointer events. Lives in `ui/pdf/src/geometry.ts`, `ui/pdf/src/crop.ts`, `ui/pdf/src/styles.css`.

## Comment editor

The editor is a popover anchored to the selection on desktop (scaling from its edge) and a bottom sheet on phones with 44px buttons; it is modal and returns focus where it came from. Keyboard closes (Esc, the submit shortcut) skip the exit animation. Lives in `ui/pdf/src/comment-editor.tsx` and `ui/pdf/src/comment-form.tsx`.
