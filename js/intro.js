// ============================================================================
// Opening: the name गीता सारथी is written in the middle of the screen, one letter
// at a time like a pen stroke, then the whole word settles and the sign-in page
// appears. Plays whenever the site opens (sign-in page). Place this script right
// after <body> opens so the page never flashes before the intro.
// ============================================================================
(function () {
  const root = document.documentElement;
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const NAME = "गीता सारथी";
  const T_LEAVE = reduce ? 900 : 2400;   // the written name fades and the page comes in
  const T_DONE = reduce ? 1500 : 3500;   // overlay removed

  // Once per browser session: coming back to the sign-in page in the same tab goes straight to the form.
  try { if (sessionStorage.getItem("gs_intro_seen") === "1") return; sessionStorage.setItem("gs_intro_seen", "1"); } catch (e) {}

  root.classList.add("intro-active");

  let overlay = null, timers = [], finished = false, leaving = false;

  function finish() {
    if (finished) return;
    finished = true;
    timers.forEach(clearTimeout);
    document.removeEventListener("keydown", onKey);
    if (overlay) overlay.remove();
    root.classList.remove("intro-active", "intro-leaving");
    const page = document.querySelector(".page");
    if (page) page.removeAttribute("inert");
    document.dispatchEvent(new CustomEvent("gs:intro-done"));
  }

  function leave(skipped) {
    if (leaving || finished) return;
    leaving = true;
    root.classList.add("intro-leaving");
    if (overlay) { if (skipped === true) overlay.classList.add("is-skipped"); overlay.classList.add("is-leaving"); }
  }

  function skip() {
    if (finished || leaving) return;
    timers.forEach(clearTimeout);
    leave(true);
    timers = [setTimeout(finish, 700)];
  }
  function onKey(e) { if (e.key === "Escape") skip(); }

  try {
    overlay = document.createElement("div");
    overlay.className = "gs-intro";
    overlay.setAttribute("role", "presentation");

    // the name: one letter at a time, each drawn left to right like a pen stroke
    const word = document.createElement("div");
    word.className = "gs-intro__word";
    word.setAttribute("lang", "hi");
    word.setAttribute("aria-hidden", "true");
    const letters = (window.Intl && Intl.Segmenter)
      ? Array.from(new Intl.Segmenter("hi", { granularity: "grapheme" }).segment(NAME), (x) => x.segment)
      : NAME.split(/(?<=[ा-्])/);
    let n = 0;
    letters.forEach((g) => {
      const span = document.createElement("span");
      if (g.trim() === "") { span.className = "gs-w-gap"; span.textContent = " "; }
      else { span.className = "gs-w-ch"; span.textContent = g; span.style.setProperty("--i", n++); }
      word.appendChild(span);
    });
    word.style.setProperty("--n", n);
    overlay.appendChild(word);

    const bar = document.createElement("div");
    bar.className = "gs-intro__bar";
    const skipBtn = document.createElement("button");
    skipBtn.type = "button";
    skipBtn.className = "gs-intro__btn";
    skipBtn.textContent = "Skip intro";
    skipBtn.addEventListener("click", skip);
    bar.appendChild(skipBtn);
    overlay.appendChild(bar);
    document.body.insertBefore(overlay, document.body.firstChild);

    // the page behind the intro cannot be tabbed into until it finishes
    const lock = () => { const page = document.querySelector(".page"); if (page && !finished) page.setAttribute("inert", ""); };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", lock); else lock();

    document.addEventListener("keydown", onKey);
    timers.push(setTimeout(leave, T_LEAVE), setTimeout(finish, T_DONE));
  } catch (err) {
    finish();
  }
})();
