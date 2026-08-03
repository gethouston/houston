(() => {
  var overlay = document.getElementById("dl-overlay");
  if (!overlay) return;

  var REGISTERED_KEY = "houston_dl_registered";
  var RELEASES_PAGE = "https://github.com/gethouston/houston/releases";
  var closeButton = document.getElementById("dl-close");
  var formStep = document.getElementById("dl-step-form");
  var downloadStep = document.getElementById("dl-step-download");
  var macGroup = document.getElementById("dl-mac-group");
  var windowsGroup = document.getElementById("dl-windows-group");
  var windowsSkip = document.getElementById("dl-windows-skip");
  var osAlt = document.getElementById("dl-os-alt");
  var macButton = document.getElementById("dl-btn");
  var x64Button = document.getElementById("dl-windows-x64-btn");
  var arm64Button = document.getElementById("dl-windows-arm64-btn");
  var currentOs = "other";
  var currentSource = "unknown";
  var dmgUrl = null;
  var winX64Url = null;
  var winArm64Url = null;
  var savedY = 0;

  // window.houstonT comes from the inline i18n block; fall back to the English
  // literal if a page ever loads this script without it.
  function tr(path, fallback) {
    return window.houstonT ? window.houstonT(path, fallback) : fallback;
  }

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

  function setButtonUrl(button, url) {
    if (!button) return;
    if (url) {
      button.href = url;
      button.classList.remove("btn-disabled");
    } else {
      button.removeAttribute("href");
      button.classList.add("btn-disabled");
    }
  }

  function refreshButtons() {
    setButtonUrl(macButton, dmgUrl);
    setButtonUrl(x64Button, winX64Url);
    setButtonUrl(arm64Button, winArm64Url);
  }

  function applyOs(os) {
    currentOs = os === "mac" || os === "windows" ? os : "other";
    if (currentOs === "mac") {
      macGroup.hidden = false;
      windowsGroup.hidden = true;
      windowsSkip.hidden = true;
      osAlt.hidden = false;
      osAlt.textContent = tr(
        "gate.needWindows",
        "Need it for Windows instead?",
      );
    } else if (currentOs === "windows") {
      macGroup.hidden = true;
      windowsGroup.hidden = false;
      windowsSkip.hidden = false;
      osAlt.hidden = false;
      osAlt.textContent = tr("gate.needMac", "Need it for Mac instead?");
    } else {
      macGroup.hidden = false;
      windowsGroup.hidden = false;
      windowsSkip.hidden = false;
      osAlt.hidden = true;
    }
  }

  function showDownloadStep() {
    formStep.hidden = true;
    downloadStep.hidden = false;
    applyOs(currentOs);
  }

  function openModal(source, os) {
    currentSource = source || "unknown";
    applyOs(os || detectOs());
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

  osAlt.addEventListener("click", () => {
    var target = currentOs === "mac" ? "windows" : "mac";
    applyOs(target);
    track("download_os_switched", { to: target });
  });

  function trackEnabledClick(button, event, name, props) {
    if (button.classList.contains("btn-disabled")) {
      event.preventDefault();
      return;
    }
    track(name, props);
  }

  macButton.addEventListener("click", (event) => {
    trackEnabledClick(macButton, event, "download_started", {
      source: currentSource,
      dmg_url: dmgUrl || "",
    });
  });
  x64Button.addEventListener("click", (event) => {
    trackEnabledClick(x64Button, event, "windows_download_started", {
      source: currentSource,
      arch: "x64",
      msi_url: winX64Url || "",
    });
  });
  arm64Button.addEventListener("click", (event) => {
    trackEnabledClick(arm64Button, event, "windows_download_started", {
      source: currentSource,
      arch: "arm64",
      msi_url: winArm64Url || "",
    });
  });

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
    if (event.target === overlay) closeModal();
  });
  closeButton.addEventListener("click", closeModal);
  document.addEventListener("keydown", (event) => {
    // With a dropdown open, Escape closes just that menu (the component stops
    // propagation; this guard is the belt to its braces), not the whole modal.
    if (event.key === "Escape" && !document.querySelector(".dl-dd.open"))
      closeModal();
  });

  window.HoustonDLForm.init({
    config: window.HOUSTON_DL_CONFIG,
    track: track,
    onSubmitted: () => {
      markRegistered();
      track("download_form_submitted", { source: currentSource });
      track("download_unlocked", { source: currentSource });
      showDownloadStep();
    },
  });

  // Installer resolution is resilient to missing assets and network errors.
  var urlsPromise;
  try {
    urlsPromise = window.houstonInstallerUrls();
  } catch (error) {
    urlsPromise = Promise.reject(error);
  }
  Promise.resolve(urlsPromise)
    .then((urls) => {
      dmgUrl = urls?.dmg;
      winX64Url = urls?.winX64;
      winArm64Url = urls?.winArm64;
    })
    .catch(() => {})
    .then(() => {
      dmgUrl = dmgUrl || RELEASES_PAGE;
      winX64Url = winX64Url || RELEASES_PAGE;
      winArm64Url = winArm64Url || RELEASES_PAGE;
      refreshButtons();
    });

  if (window.location.hash === "#download") openModal("hash", detectOs());
})();
