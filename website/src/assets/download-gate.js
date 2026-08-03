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
      osAlt.textContent = "Need it for Windows instead?";
    } else if (currentOs === "windows") {
      macGroup.hidden = true;
      windowsGroup.hidden = false;
      windowsSkip.hidden = false;
      osAlt.hidden = false;
      osAlt.textContent = "Need it for Mac instead?";
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
  }

  function closeModal() {
    overlay.classList.remove("open");
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
    // With the country-code menu open, Escape closes just the menu (its own
    // handler in download-gate-form.js), not the whole modal.
    if (event.key === "Escape" && !document.querySelector(".dl-cc.open"))
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
