// The download step's buttons: which platform group is visible, where each
// button points, and what a click reports. The modal around them (opening,
// closing, the form gate) is download-gate.js, which drives this through
// `window.HoustonDLButtons.init`.
(() => {
  var RELEASES_PAGE = "https://github.com/gethouston/houston/releases";

  // window.houstonT comes from the inline i18n block; fall back to the English
  // literal if a page ever loads this script without it.
  function tr(path, fallback) {
    return window.houstonT ? window.houstonT(path, fallback) : fallback;
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

  /**
   * Wires the buttons and starts resolving the installer URLs. `opts.track` is
   * the page's analytics helper, `opts.funnel` the first-party sink, and
   * `opts.source` reads which entry point opened the modal (it changes between
   * opens, so it is read per click). Returns the handle download-gate.js uses:
   * `applyOs(os)` pins the visible group and answers with the platform it
   * settled on, `os()` reads that back later.
   */
  function init(opts) {
    var macGroup = document.getElementById("dl-mac-group");
    var windowsGroup = document.getElementById("dl-windows-group");
    var linuxGroup = document.getElementById("dl-linux-group");
    var windowsSkip = document.getElementById("dl-windows-skip");
    var osAlt = document.getElementById("dl-os-alt");
    var macButton = document.getElementById("dl-btn");
    var x64Button = document.getElementById("dl-windows-x64-btn");
    var arm64Button = document.getElementById("dl-windows-arm64-btn");
    var linuxButton = document.getElementById("dl-linux-btn");
    var currentOs = "other";
    var dmgUrl = null;
    var winX64Url = null;
    var winArm64Url = null;
    var appImageUrl = null;

    function refreshButtons() {
      setButtonUrl(macButton, dmgUrl);
      setButtonUrl(x64Button, winX64Url);
      setButtonUrl(arm64Button, winArm64Url);
      setButtonUrl(linuxButton, appImageUrl);
    }

    function applyOs(os) {
      var next = os || currentOs;
      currentOs =
        next === "mac" || next === "windows" || next === "linux"
          ? next
          : "other";
      // A pinned OS shows only its own group plus an escape hatch that reveals
      // every platform; "other" starts with all of them visible.
      var pinned = currentOs !== "other";
      macGroup.hidden = pinned && currentOs !== "mac";
      windowsGroup.hidden = pinned && currentOs !== "windows";
      linuxGroup.hidden = pinned && currentOs !== "linux";
      windowsSkip.hidden = windowsGroup.hidden;
      osAlt.hidden = !pinned;
      if (pinned) {
        osAlt.textContent = tr("gate.needOther", "Need it for a different OS?");
      }
      return currentOs;
    }

    osAlt.addEventListener("click", () => {
      applyOs("other");
      opts.track("download_os_switched", { to: "all" });
    });

    // `os` is the platform the button actually downloads, which is not always
    // the detected one: from the "different OS?" view a Mac visitor can pick
    // the MSI.
    function trackEnabledClick(button, event, name, props, os) {
      if (button.classList.contains("btn-disabled")) {
        event.preventDefault();
        return;
      }
      opts.track(name, props);
      opts.funnel("download_started", { os: os });
    }

    macButton.addEventListener("click", (event) => {
      trackEnabledClick(
        macButton,
        event,
        "download_started",
        { source: opts.source(), dmg_url: dmgUrl || "" },
        "mac",
      );
    });
    x64Button.addEventListener("click", (event) => {
      trackEnabledClick(
        x64Button,
        event,
        "windows_download_started",
        { source: opts.source(), arch: "x64", msi_url: winX64Url || "" },
        "windows",
      );
    });
    arm64Button.addEventListener("click", (event) => {
      trackEnabledClick(
        arm64Button,
        event,
        "windows_download_started",
        { source: opts.source(), arch: "arm64", msi_url: winArm64Url || "" },
        "windows",
      );
    });
    linuxButton.addEventListener("click", (event) => {
      trackEnabledClick(
        linuxButton,
        event,
        "linux_download_started",
        { source: opts.source(), appimage_url: appImageUrl || "" },
        "linux",
      );
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
        appImageUrl = urls?.appImage;
      })
      .catch(() => {})
      .then(() => {
        dmgUrl = dmgUrl || RELEASES_PAGE;
        winX64Url = winX64Url || RELEASES_PAGE;
        winArm64Url = winArm64Url || RELEASES_PAGE;
        appImageUrl = appImageUrl || RELEASES_PAGE;
        refreshButtons();
      });

    return {
      applyOs: applyOs,
      os: () => currentOs,
    };
  }

  window.HoustonDLButtons = { init: init };
})();
