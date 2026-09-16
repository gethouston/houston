// The download modal: opening it, the registration gate in front of it, and
// closing it again. The buttons inside the download step — platform groups,
// installer URLs, what a click reports — are download-gate-buttons.js.
(() => {
  var overlay = document.getElementById("dl-overlay");
  if (!overlay) return;

  var REGISTERED_KEY = "houston_dl_registered";
  var closeButton = document.getElementById("dl-close");
  var formStep = document.getElementById("dl-step-form");
  var downloadStep = document.getElementById("dl-step-download");
  var currentSource = "unknown";
  var savedY = 0;

  // First-party funnel sink (assets/houston-analytics.js). Optional by design:
  // the gate keeps working when that asset is blocked or fails to load.
  function funnel(name, fields) {
    if (window.HoustonAnalytics) window.HoustonAnalytics.track(name, fields);
  }

  // The download step's buttons ship as their own asset, so they are optional
  // the same way the funnel sink is: `buttons` stays null when it did not load.
  // It is initialised BELOW the listeners, after the modal itself works — an
  // inert download button on every page is the one failure this gate must not
  // risk for the sake of the rows inside it.
  var buttons = null;

  // The landing drives the page with Lenis smooth scroll. Freezing the native
  // scroll alone is not enough: Lenis keeps its own position, so it has to be
  // stopped and restored too, or a wheel over the modal scrolls the page.
  function lockScroll() {
    if (document.documentElement.classList.contains("dl-modal-open")) return;
    savedY = window.scrollY;
    var gutter = window.innerWidth - document.documentElement.clientWidth;
    document.documentElement.style.setProperty("--dl-sbw", `${gutter}px`);
    if (window.lenis?.stop) window.lenis.stop();
    document.documentElement.classList.add("dl-modal-open");
  }

  function unlockScroll() {
    document.documentElement.classList.remove("dl-modal-open");
    if (window.lenis?.start) {
      window.lenis.start();
      window.lenis.scrollTo(savedY, { immediate: true });
    } else {
      window.scrollTo(0, savedY);
    }
  }

  function isRegistered() {
    try {
      return window.localStorage.getItem(REGISTERED_KEY) === "1";
    } catch (_error) {
      return false;
    }
  }

  function markRegistered() {
    try {
      window.localStorage.setItem(REGISTERED_KEY, "1");
    } catch (_error) {}
  }

  function showDownloadStep() {
    formStep.hidden = true;
    downloadStep.hidden = false;
    buttons?.applyOs();
  }

  function openModal(source, os) {
    currentSource = source || "unknown";
    var wantedOs = os || detectOs();
    // The buttons asset settles the platform (it may fall back when a build is
    // missing for one); without it the page's own detection is the answer.
    var currentOs = buttons ? buttons.applyOs(wantedOs) : wantedOs;
    track("app_download_clicked", { os: currentOs });
    track("download_clicked", { source: currentSource });
    if (isRegistered()) {
      showDownloadStep();
    } else {
      formStep.hidden = false;
      downloadStep.hidden = true;
      setTimeout(() => {
        var name = document.getElementById("dl-name");
        if (name) name.focus();
      }, 200);
    }
    overlay.classList.add("open");
    lockScroll();
  }

  function closeModal() {
    if (!overlay.classList.contains("open")) return;
    overlay.classList.remove("open");
    unlockScroll();
  }

  document.querySelectorAll("[data-dl-trigger]").forEach((element) => {
    element.addEventListener("click", (event) => {
      event.preventDefault();
      openModal(
        element.getAttribute("data-dl-source") || "nav",
        element.getAttribute("data-dl-os") || detectOs(),
      );
    });
  });
  overlay.addEventListener("click", (event) => {
    if (event.target !== overlay) return;
    // The dropdown menus are fixed-positioned, so they can hang over the
    // backdrop. A near-miss on a country row must not throw away the whole
    // filled-in form: with a menu open the backdrop only dismisses the menu
    // (the dropdown's own outside-click handler does that), same as Escape.
    if (document.querySelector(".dl-dd.open")) return;
    closeModal();
  });
  closeButton.addEventListener("click", closeModal);
  document.addEventListener("keydown", (event) => {
    // With a dropdown open, Escape closes just that menu (the component stops
    // propagation; this guard is the belt to its braces), not the whole modal.
    if (event.key === "Escape" && !document.querySelector(".dl-dd.open"))
      closeModal();
  });

  if (window.HoustonDLButtons) {
    buttons = window.HoustonDLButtons.init({
      track: track,
      funnel: funnel,
      // Read per click: which entry point opened the modal changes between opens.
      source: () => currentSource,
    });
  }

  // The registration step's own asset, optional for the same reason the two
  // above are: if it never loaded there is nothing to submit, but the modal and
  // every way out of it are this file's job and must not go down with it. A
  // visitor who already registered never needed it — they land on the buttons.
  if (window.HoustonDLForm) {
    window.HoustonDLForm.init({
      config: window.HOUSTON_DL_CONFIG,
      track: track,
      // Read per submit, same as the buttons above: the lead carries the entry
      // point the visitor opened the gate from.
      source: () => currentSource,
      onSubmitted: (payload) => {
        markRegistered();
        // The address is handed over raw and hashed inside the analytics asset;
        // only the SHA-256 digest is put on the wire.
        funnel("download_form_completed", {
          email: payload.email,
          os: buttons ? buttons.os() : detectOs(),
        });
        track("download_form_submitted", { source: currentSource });
        track("download_unlocked", { source: currentSource });
        showDownloadStep();
      },
    });
  }

  if (window.location.hash === "#download") openModal("hash", detectOs());
})();
