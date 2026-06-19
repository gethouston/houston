/**
 * Houston captions bridge — injected via WebviewWindowBuilder::initialization_script.
 *
 * Adapted from openhuman/app/src-tauri/src/meet_audio/captions_bridge.js.
 * Key difference: instead of polling via CDP (OpenHuman/CEF), this bridge
 * POSTs captions directly to the houston-engine REST API. The engine runs
 * on localhost and has permissive CORS, so cross-origin fetch from
 * meet.google.com works without any Tauri IPC from an external webview.
 *
 * Globals injected by meeting_open_window before this script:
 *   window.__HOUSTON_ENGINE_URL__    e.g. "http://127.0.0.1:45678"
 *   window.__HOUSTON_ENGINE_TOKEN__  bearer token
 *   window.__HOUSTON_MEETING_ID__    UUID of the Meeting record
 *   window.__HOUSTON_AGENT_PATH__    absolute path to agent folder
 *   window.__HOUSTON_BOT_NAME__      bot display name (default "Houston")
 */
(function () {
  "use strict";

  var ENGINE_URL = window.__HOUSTON_ENGINE_URL__ || "";
  var ENGINE_TOKEN = window.__HOUSTON_ENGINE_TOKEN__ || "";
  var MEETING_ID = window.__HOUSTON_MEETING_ID__ || "";
  var AGENT_PATH = window.__HOUSTON_AGENT_PATH__ || "";
  var BOT_NAME = window.__HOUSTON_BOT_NAME__ || "Houston";

  if (!ENGINE_URL || !MEETING_ID) {
    console.warn("[houston/captions] injection vars missing — bridge disabled");
    return;
  }

  // ── Caption queue ─────────────────────────────────────────────────────────
  var queue = [];
  var seen = new Set();

  function enqueue(speaker, text) {
    var trimText = text.trim();
    var trimSpeaker = (speaker || "Participant").trim();
    if (!trimText || trimText.length < 2) return;
    var key = trimSpeaker + "\x00" + trimText;
    if (seen.has(key)) return;
    seen.add(key);
    queue.push({ speaker: trimSpeaker, text: trimText, timestamp: new Date().toISOString() });
    checkForHoustonMention(trimSpeaker, trimText);
  }

  // ── Google Meet caption selectors ─────────────────────────────────────────
  // NOTE: [data-is-muted] was intentionally removed — it matches participant
  // tiles (mute state), not caption text, causing false "audio toggle" captures.
  var CAPTION_CONTAINER_SELECTORS = [
    "[jsname='YSxPC']",   // Caption block container (stable across Meet versions)
    "[jsname='dsyhDe']",  // Alternative caption container jsname
  ];

  var SPEAKER_SELECTORS = [
    "[jsname='r4nke']",
    "[jsname='Yv8j3b']",
    ".zs7s8d",
    ".NWpY1d",
  ];

  var TEXT_SELECTORS = [
    "[jsname='tgaKEf']",
    "[jsname='XznOxd']",
    ".a4cQT",
    ".VbkSUe",
  ];

  function scrapeRoot(root) {
    // Strategy 1: structured caption containers (most precise)
    var containers = [];
    CAPTION_CONTAINER_SELECTORS.forEach(function (sel) {
      root.querySelectorAll(sel).forEach(function (el) { containers.push(el); });
    });

    if (containers.length > 0) {
      containers.forEach(function (container) {
        var speaker = "";
        for (var i = 0; i < SPEAKER_SELECTORS.length; i++) {
          var sp = container.querySelector(SPEAKER_SELECTORS[i]);
          if (sp && sp.textContent.trim()) { speaker = sp.textContent.trim(); break; }
        }

        var text = "";
        for (var j = 0; j < TEXT_SELECTORS.length; j++) {
          var tx = container.querySelector(TEXT_SELECTORS[j]);
          if (tx && tx.textContent.trim()) { text = tx.textContent.trim(); break; }
        }

        if (!text) {
          var segs = container.querySelectorAll("span[jsname]");
          segs.forEach(function (s) { text += s.textContent; });
          text = text.trim();
        }

        if (text && text !== BOT_NAME) {
          enqueue(speaker || "Participant", text);
        }
      });
      return;
    }

    // Strategy 2: caption area by aria-label (EN / ES / PT)
    var captionArea = root.querySelector("[aria-label='Captions']")
      || root.querySelector("[aria-label='Subtítulos']")
      || root.querySelector("[aria-label='Legendas']");
    if (captionArea) {
      captionArea.querySelectorAll("[jsname]").forEach(function (block) {
        var text = block.textContent.trim();
        if (text && text !== BOT_NAME && text.length > 2) {
          enqueue("Participant", text);
        }
      });
      // Fallback: raw text if no jsname children
      if (captionArea.querySelectorAll("[jsname]").length === 0) {
        var raw = captionArea.textContent.trim();
        if (raw) {
          var m = raw.match(/^([^:]{1,60}):\s*(.+)$/s);
          if (m) { enqueue(m[1].trim(), m[2].trim()); }
          else { enqueue("Participant", raw); }
        }
      }
      return;
    }

    // Strategy 3: aria-live="polite" regions that look like captions
    // (shorter text, updates frequently — filters out notification toasts)
    root.querySelectorAll('[aria-live="polite"]').forEach(function (el) {
      var text = el.textContent.trim();
      if (text && text.length > 2 && text.length < 300 && text !== BOT_NAME) {
        // Only enqueue if this element is near the bottom of the viewport
        var rect = el.getBoundingClientRect();
        if (rect.bottom > window.innerHeight * 0.5) {
          enqueue("Participant", text);
        }
      }
    });
  }

  // ── Auto-enable captions ──────────────────────────────────────────────────
  var ENABLE_LABELS = [
    "Turn on captions",
    "Activar subtítulos",
    "Ativar legendas",
    "Turn on closed captions",
    "CC",
  ];

  var captionsEnabled = false;

  function tryEnableCaptions() {
    if (captionsEnabled) return true;
    for (var i = 0; i < ENABLE_LABELS.length; i++) {
      var btn = document.querySelector('[aria-label="' + ENABLE_LABELS[i] + '"]')
        || document.querySelector('[data-tooltip="' + ENABLE_LABELS[i] + '"]');
      if (btn) {
        btn.click();
        captionsEnabled = true;
        console.log("[houston/captions] enabled captions via:", ENABLE_LABELS[i]);
        return true;
      }
    }
    return false;
  }

  // ── Houston mention detection + live chat response ────────────────────────

  var respondedKeys = new Set();
  var houstonDebounceTimer = null;
  var pendingHoustonQuestion = null;

  // Called for every new unique caption. If the bot is addressed by name,
  // debounce 2.5 s (to let the full sentence arrive) then call the engine.
  function checkForHoustonMention(speaker, text) {
    if (speaker === BOT_NAME) return; // don't respond to ourselves
    var lower = text.toLowerCase();
    if (lower.indexOf(BOT_NAME.toLowerCase()) === -1) return;

    // Keep the latest utterance that mentioned us
    pendingHoustonQuestion = { speaker: speaker, text: text };
    clearTimeout(houstonDebounceTimer);
    houstonDebounceTimer = setTimeout(function () {
      if (!pendingHoustonQuestion) return;
      var q = pendingHoustonQuestion;
      pendingHoustonQuestion = null;
      var key = q.speaker + "\x00" + q.text;
      if (respondedKeys.has(key)) return;
      respondedKeys.add(key);
      askHouston(q.speaker, q.text);
    }, 2500);
  }

  function askHouston(speaker, question) {
    // Last 10 captions as transcript context
    var recent = queue.slice(-10).map(function (c) {
      return c.speaker + ": " + c.text;
    }).join("\n");

    console.log("[houston/captions] responding to " + speaker + ":", question);

    var controller = new AbortController();
    var timeoutId = setTimeout(function () { controller.abort(); }, 90000);

    fetch(ENGINE_URL + "/v1/meetings/" + MEETING_ID + "/respond", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + ENGINE_TOKEN,
      },
      body: JSON.stringify({ agentPath: AGENT_PATH, question: question, recentTranscript: recent }),
      signal: controller.signal,
    })
      .then(function (r) {
        clearTimeout(timeoutId);
        if (!r.ok) throw new Error("respond endpoint returned " + r.status);
        return r.json();
      })
      .then(function (data) {
        if (data.response && data.response.trim()) {
          var reply = data.response.trim();
          injectMeetChat(reply);
          // Add bot reply to our own transcript
          enqueue(BOT_NAME, reply);
        }
      })
      .catch(function (err) {
        clearTimeout(timeoutId);
        console.error("[houston/captions] respond failed:", err);
      });
  }

  // Chat panel button labels (EN / ES / PT)
  var CHAT_BTN_LABELS = [
    "Chat with everyone",
    "Chatear con todos",
    "Bater papo com todos",
    "Open chat",
    "Abrir bate-papo",
  ];

  // Chat input aria-labels
  var CHAT_INPUT_LABELS = [
    "Send a message to everyone",
    "Enviar un mensaje a todos",
    "Enviar uma mensagem para todos",
  ];

  function injectMeetChat(text) {
    // Open the chat panel if it isn't already open
    for (var i = 0; i < CHAT_BTN_LABELS.length; i++) {
      var btn = document.querySelector('[aria-label="' + CHAT_BTN_LABELS[i] + '"]')
        || document.querySelector('[data-tooltip="' + CHAT_BTN_LABELS[i] + '"]');
      if (btn) { btn.click(); break; }
    }

    // Poll for the chat input (may need a moment to appear after opening panel)
    var attempts = 0;
    var inputTimer = setInterval(function () {
      var input = null;
      for (var j = 0; j < CHAT_INPUT_LABELS.length; j++) {
        var el = document.querySelector('[aria-label="' + CHAT_INPUT_LABELS[j] + '"]');
        if (el) { input = el; break; }
      }
      if (!input) {
        // Fallback selectors for various Meet builds
        input = document.querySelector('[jsname="aTifif"]')
          || document.querySelector('[contenteditable="true"][role="textbox"]');
      }

      if (input || ++attempts > 15) {
        clearInterval(inputTimer);
        if (!input) {
          console.warn("[houston/captions] chat input not found; cannot inject response");
          return;
        }

        input.focus();
        if (input.getAttribute("contenteditable") === "true") {
          document.execCommand("selectAll", false, null);
          document.execCommand("insertText", false, text);
        } else {
          var nativeSetter = Object.getOwnPropertyDescriptor(
            window.HTMLTextAreaElement.prototype, "value"
          );
          if (nativeSetter && nativeSetter.set) {
            nativeSetter.set.call(input, text);
            input.dispatchEvent(new Event("input", { bubbles: true }));
          }
        }

        // Press Enter to send
        setTimeout(function () {
          input.dispatchEvent(new KeyboardEvent("keydown", {
            key: "Enter", code: "Enter", keyCode: 13,
            which: 13, bubbles: true, cancelable: true,
          }));
        }, 150);
      }
    }, 200);
  }

  // ── Auto-end when all participants leave ──────────────────────────────────
  var meetingEnded = false;
  var aloneStartedAt = null;

  function triggerMeetingEnd() {
    if (meetingEnded) return;
    meetingEnded = true;
    console.log("[houston/captions] auto-ending — no other participants");
    flush(); // send any buffered captions first
    fetch(ENGINE_URL + "/v1/meetings/" + MEETING_ID + "/end", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + ENGINE_TOKEN,
      },
      body: JSON.stringify({ agentPath: AGENT_PATH }),
    }).catch(function (err) {
      console.error("[houston/captions] auto-end request failed:", err);
    });
  }

  function checkMeetingOver() {
    if (meetingEnded) return;

    // 1. Post-call overlay text (EN / ES / PT)
    var bodyText = document.body.innerText || "";
    var endPhrases = [
      "You've left the meeting",
      "The meeting has ended",
      "You've been removed",
      "Meeting ended for all",
      "Saliste de la reunión",
      "La reunión ha finalizado",
      "Você saiu da reunião",
      "A reunião encerrou",
    ];
    for (var i = 0; i < endPhrases.length; i++) {
      if (bodyText.indexOf(endPhrases[i]) !== -1) {
        triggerMeetingEnd();
        return;
      }
    }

    // 2. Participant count from the People button aria-label ("People (1)")
    var peopleBtn = document.querySelector('[aria-label^="People"]')
      || document.querySelector('[data-tooltip^="People"]');
    if (peopleBtn) {
      var label = peopleBtn.getAttribute("aria-label") || peopleBtn.getAttribute("data-tooltip") || "";
      var match = label.match(/\((\d+)\)/);
      if (match && parseInt(match[1], 10) === 1) {
        // Confirm after 3s of being alone to avoid transient states
        if (!aloneStartedAt) {
          aloneStartedAt = Date.now();
        } else if (Date.now() - aloneStartedAt >= 3000) {
          triggerMeetingEnd();
        }
        return;
      }
    }

    // 3. Participant tile count (data-participant-id present on each tile)
    var tiles = document.querySelectorAll("[data-participant-id]");
    if (tiles.length === 1) {
      if (!aloneStartedAt) {
        aloneStartedAt = Date.now();
      } else if (Date.now() - aloneStartedAt >= 3000) {
        triggerMeetingEnd();
      }
    } else {
      aloneStartedAt = null;
    }
  }

  // ── MutationObserver ──────────────────────────────────────────────────────
  var observer = new MutationObserver(function () {
    scrapeRoot(document.body);
  });

  function startObserver() {
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  // ── Flush to houston-engine REST API ─────────────────────────────────────
  var flushing = false;

  function flush() {
    if (flushing || queue.length === 0) return;
    flushing = true;
    var lines = queue.splice(0, queue.length);
    fetch(ENGINE_URL + "/v1/meetings/" + MEETING_ID + "/captions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + ENGINE_TOKEN,
      },
      body: JSON.stringify({ agentPath: AGENT_PATH, captions: lines }),
    })
      .catch(function (err) {
        console.warn("[houston/captions] flush failed:", err);
        if (queue.length < 200) {
          for (var i = lines.length - 1; i >= 0; i--) queue.unshift(lines[i]);
        }
      })
      .finally(function () { flushing = false; });
  }

  // ── Boot ──────────────────────────────────────────────────────────────────
  function boot() {
    if (!tryEnableCaptions()) {
      var attempts = 0;
      var enableTimer = setInterval(function () {
        if (tryEnableCaptions() || ++attempts > 60) clearInterval(enableTimer);
      }, 500);
    }

    startObserver();

    // Belt-and-suspenders poll (observer can miss CharacterData on some builds).
    setInterval(function () { scrapeRoot(document.body); }, 250);

    // Flush to engine every 500ms.
    setInterval(flush, 500);

    console.log("[houston/captions] bridge active — meeting", MEETING_ID);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
