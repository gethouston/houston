(() => {
  var overlay = document.getElementById("dl-overlay");
  if (!overlay) return;

  var REGISTERED_KEY = "houston_dl_registered";
  var closeButton = document.getElementById("dl-close");
  var formStep = document.getElementById("dl-step-form");
  var downloadStep = document.getElementById("dl-step-download");
  var currentSource = "unknown";
  var savedY = 0;

  function funnel(name, fields) {
    if (window.HoustonAnalytics) window.HoustonAnalytics.track(name, fields);
  }

  var buttons = null;

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
    if (document.querySelector(".dl-dd.open")) return;
    closeModal();
  });
  closeButton.addEventListener("click", closeModal);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !document.querySelector(".dl-dd.open"))
      closeModal();
  });

  if (window.HoustonDLButtons) {
    buttons = window.HoustonDLButtons.init({
      track: track,
      funnel: funnel,
      source: () => currentSource,
    });
  }

  if (window.HoustonDLForm) {
    window.HoustonDLForm.init({
      config: window.HOUSTON_DL_CONFIG,
      track: track,
      source: () => currentSource,
      onSubmitted: (payload) => {
        markRegistered();
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
