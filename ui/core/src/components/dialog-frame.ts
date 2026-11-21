export const DIALOG_OVERLAY_CLASS =
  "fixed inset-0 z-50 bg-black/25 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0";

export const DIALOG_CONTENT_CLASS =
  "ht-shadow-dialog fixed top-[50%] left-[50%] z-50 grid grid-cols-[minmax(0,1fr)] w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-2xl border border-line/50 bg-dialog p-6 duration-200 outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95";

export const DIALOG_HEADER_FRAME_CLASS = "gap-1.5 text-center md:text-left";

export const DIALOG_HEADER_CLASS = `flex flex-col ${DIALOG_HEADER_FRAME_CLASS}`;

export const DIALOG_TITLE_CLASS = "text-lg font-semibold";

export const DIALOG_DESCRIPTION_CLASS = "text-sm text-ink-muted";

export const DIALOG_CLOSE_CLASS =
  "shrink-0 rounded-lg p-1.5 text-ink-muted transition-colors duration-200 outline-none hover:bg-hover hover:text-ink focus-visible:ring-[3px] focus-visible:ring-focus/50 disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4";

export const DIALOG_CLOSE_CORNER_CLASS = "absolute top-4 right-4";

export const DIALOG_FOOTER_CLASS =
  "flex flex-col-reverse gap-2 md:flex-row md:justify-end";
