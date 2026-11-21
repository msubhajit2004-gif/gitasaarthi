// ThoughtLine: vanilla port of the React Bits component (no React, no motion lib).
// A breathing mark, a shimmering working label, a live timer and a trace of steps
// that tick off as they finish. Breathing and shimmer run in CSS.
//
//   const t = createThoughtLine({ label: "Krishna is listening…", steps: [...] });
//   host.appendChild(t.el);
//   t.addStep("Finding a verse");   // earlier steps tick, the last one pulses
//   t.settle();                     // freezes the clock, shows "Thought for 0.8s"
//   t.destroy();
(function () {
  const SPARK =
    '<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 3v4M17 5h4M5 17v4M3 19h4"/></svg>';
  const TICK =
    '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

  const fmt = (ds) => (ds < 600 ? (ds / 10).toFixed(1) + "s" : Math.floor(ds / 600) + "m " + ((ds % 600) / 10).toFixed(1) + "s");

  window.createThoughtLine = function (options) {
    const o = Object.assign({ label: "Thinking…", doneLabel: "Thought for", steps: [], showTimer: true }, options);
    const el = document.createElement("div");
    el.className = "thought-line";
    el.setAttribute("data-working", "");
    el.innerHTML =
      '<div class="thought-line__head">' +
      '<span class="thought-line__glyph" aria-hidden="true">' + SPARK + "</span>" +
      '<span class="thought-line__label"></span>' +
      (o.showTimer ? '<span class="thought-line__timer" aria-hidden="true">0.0s</span>' : "") +
      '<span class="thought-line__sr" role="status"></span>' +
      "</div>" +
      '<div class="thought-line__steps"></div>';

    const labelEl = el.querySelector(".thought-line__label");
    const timerEl = el.querySelector(".thought-line__timer");
    const srEl = el.querySelector(".thought-line__sr");
    const stepsEl = el.querySelector(".thought-line__steps");
    const started = performance.now();
    let ds = 0;
    let working = true;
    let steps = [];

    const renderSteps = () => {
      stepsEl.innerHTML = "";
      steps.forEach((text, i) => {
        const done = !working || i < steps.length - 1;
        const row = document.createElement("div");
        row.className = "thought-line__step";
        if (done) row.setAttribute("data-done", "");
        row.innerHTML = '<span class="thought-line__mark" aria-hidden="true">' + (done ? TICK : '<i class="thought-line__pulse"></i>') + '</span><span class="thought-line__step-text"></span>';
        row.lastChild.textContent = text;
        stepsEl.appendChild(row);
      });
    };

    labelEl.textContent = o.label;
    srEl.textContent = o.label;
    steps = o.steps.slice();
    renderSteps();

    const timer = setInterval(() => {
      ds = Math.floor((performance.now() - started) / 100);
      if (timerEl) timerEl.textContent = fmt(ds);
    }, 100);

    return {
      el,
      addStep(text) {
        if (!working) return;
        steps.push(text);
        renderSteps();
      },
      settle() {
        if (!working) return;
        working = false;
        clearInterval(timer);
        ds = Math.floor((performance.now() - started) / 100);
        if (timerEl) timerEl.textContent = fmt(ds);
        el.removeAttribute("data-working");
        labelEl.textContent = o.doneLabel;
        srEl.textContent = o.doneLabel + " " + fmt(ds);
        renderSteps();
        return ds / 10;
      },
      destroy() {
        clearInterval(timer);
        el.remove();
      }
    };
  };
})();
