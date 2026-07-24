/*
 * Hero headline cycling word — blur-letter-stagger (Aceternity FlipWords
 * technique). The h1 reads "AI agents that do <cycling phrase>": the phrase
 * swaps every few seconds, each letter blurring in and out on a stagger, with
 * a smooth width transition so the line reflows cleanly.
 *
 * Progressive: prefers-reduced-motion shows the first phrase statically and
 * never starts the loop. Loaded `defer`; reads #hero-cycling.
 */
(() => {
  var words = [
    "the work for you",
    "sales reports in Google Sheets",
    "candidate outreach on LinkedIn",
    "expense reports in QuickBooks",
    "order management in Shopify",
    "email campaigns in Gmail",
    "payment follow-ups in Stripe",
    "lead tracking in HubSpot",
  ];
  var container = document.getElementById("hero-cycling");
  if (!container) return;

  var currentIndex = 0;
  var isAnimating = false;
  var DISPLAY_DURATION = 3000;
  var LETTER_STAGGER = 40; // ms between each letter reveal
  var EXIT_STAGGER = 20; // ms between each letter exit (faster)
  var EXIT_DURATION = 250; // total exit animation time
  var ENTER_SETTLE = 100; // pause after last letter before considering "done"

  function createWordEl(word, cls) {
    var span = document.createElement("span");
    span.className = `cycling-word${cls ? ` ${cls}` : ""}`;
    for (let i = 0; i < word.length; i++) {
      const letter = document.createElement("span");
      letter.className = "cycling-letter";
      letter.textContent = word[i] === " " ? " " : word[i];
      span.appendChild(letter);
    }
    return span;
  }

  function revealLetters(wordEl, callback) {
    var letters = wordEl.querySelectorAll(".cycling-letter");
    var totalTime = 0;
    for (let i = 0; i < letters.length; i++) {
      ((el, delay) => {
        setTimeout(() => {
          el.classList.add("is-visible");
        }, delay);
      })(letters[i], i * LETTER_STAGGER);
      totalTime = i * LETTER_STAGGER;
    }
    if (callback) setTimeout(callback, totalTime + ENTER_SETTLE);
  }

  function exitLetters(wordEl, callback) {
    var letters = wordEl.querySelectorAll(".cycling-letter");
    // Exit in reverse order for a nice cascade
    for (let i = 0; i < letters.length; i++) {
      ((el, delay) => {
        setTimeout(() => {
          el.classList.remove("is-visible");
          el.classList.add("is-exiting");
        }, delay);
      })(letters[i], i * EXIT_STAGGER);
    }
    if (callback) setTimeout(callback, EXIT_DURATION);
  }

  function cycleToNext() {
    if (isAnimating) return;
    isAnimating = true;

    var oldWord = container.querySelector(".cycling-word:not(.is-exiting)");
    var nextIndex = (currentIndex + 1) % words.length;

    exitLetters(oldWord, () => {
      if (oldWord?.parentNode) oldWord.parentNode.removeChild(oldWord);

      var newWordEl = createWordEl(words[nextIndex]);
      container.appendChild(newWordEl);

      // Measure and set container width for smooth transition
      container.style.width = `${newWordEl.offsetWidth}px`;

      requestAnimationFrame(() => {
        revealLetters(newWordEl, () => {
          isAnimating = false;
        });
      });

      currentIndex = nextIndex;
    });
  }

  // Set up smooth width transitions
  container.style.transition = "width 0.4s cubic-bezier(0.16, 1, 0.3, 1)";
  container.style.display = "inline-block";

  // Initial word — reveal with stagger
  var firstWord = createWordEl(words[0]);
  container.appendChild(firstWord);
  container.style.width = `${firstWord.offsetWidth}px`;

  // Reduced motion: show the first phrase statically and never start the loop.
  var reduceMotion = window.matchMedia?.(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  if (reduceMotion) {
    firstWord.querySelectorAll(".cycling-letter").forEach((el) => {
      el.classList.add("is-visible");
    });
    return;
  }

  requestAnimationFrame(() => {
    revealLetters(firstWord);
  });

  setInterval(cycleToNext, DISPLAY_DURATION);
})();
