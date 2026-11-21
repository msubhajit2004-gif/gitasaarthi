// ============================================================================
// GitaSaarthi effects: two content-driven effects, written from scratch after
// ideas on reactbits.dev. Each one explains what is happening, so they stay:
//   1. Split Text - today's verse rises in word by word, once
//   2. Text Type - Krishna's replies are typed out
// 3. Click Spark - small sparks where you click or tap
// (Light Rays and Glow Cursor were tried and removed as decoration.)
// Both are skipped when the system asks for reduced motion.
// ============================================================================

(function () {
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---------------------------------------------------------------- 1. Split Text
  // Splits an element's text into words (never characters: splitting Devanagari
  // by character breaks its joined letter shapes) and lets each word rise in
  // with a short stagger. aria-label keeps the full text readable by screen readers.
  function splitText(el, opts) {
    if (!el || reduce) return;
    const text = el.textContent;
    if (!text.trim()) return;
    const step = (opts && opts.step) || 60;
    const delay = (opts && opts.delay) || 0;
    el.textContent = "";
    let i = 0;
    text.split(/(\s+)/).forEach((token) => {
      if (!token) return;
      if (/^\s+$/.test(token)) { el.appendChild(document.createTextNode(token)); return; }
      const span = document.createElement("span");
      span.className = "st-word";
      span.setAttribute("aria-hidden", "true");
      span.textContent = token;
      span.style.animationDelay = delay + i * step + "ms";
      el.appendChild(span);
      i++;
    });
    // The words above are animated and hidden from screen readers; this visually hidden copy is what they read.
    const sr = document.createElement("span");
    sr.className = "sr-only";
    sr.textContent = text;
    el.appendChild(sr);
  }

  // ---------------------------------------------------------------- 2. Text Type
  function typeInto(target, done) {
    const full = target.textContent;
    if (!full) { done(); return () => {}; }
    target.textContent = "";
    target.classList.add("type-caret");
    const node = document.createTextNode("");
    target.appendChild(node);
    const per = Math.max(8, Math.min(24, 2600 / full.length));
    let n = 0;
    let timer = null;
    const viewport = document.getElementById("chat-viewport");
    const finish = () => {
      clearTimeout(timer);
      node.nodeValue = full;
      target.classList.remove("type-caret");
      done();
    };
    const tick = () => {
      n = Math.min(full.length, n + 1);
      node.nodeValue = full.slice(0, n);
      if (viewport && !target.closest(".krishna-counsel-card")) viewport.scrollTop = viewport.scrollHeight;
      if (n >= full.length) finish();
      else timer = setTimeout(tick, per);
    };
    timer = setTimeout(tick, 250);
    return finish;
  }

  function watchReplies() {
    const viewport = document.getElementById("chat-viewport");
    if (!viewport || reduce) return;
    new MutationObserver((mutations) => {
      for (const m of mutations) {
        m.addedNodes.forEach((node) => {
          if (!node.querySelector) return;
          const card = node.querySelector(".krishna-counsel-card");
          if (!card || card.dataset.typed) return;
          card.dataset.typed = "1";
          const target = card.querySelector(".krishna-ack-text, .krishna-synthesis-text");
          if (!target) return;
          target.classList.add("type-target");
          card.classList.add("typing");
          card.setAttribute("aria-busy", "true");
          const complete = () => {
            card.classList.remove("typing");
            card.classList.add("revealed");
            card.removeAttribute("aria-busy");
            card.removeEventListener("pointerdown", skip);
            // keep the reader at the first line of the reply, not mid-way down it
            viewport.scrollTop += card.getBoundingClientRect().top - viewport.getBoundingClientRect().top - 8;
          };
          const finish = typeInto(target, complete);
          function skip() { finish(); }
          card.addEventListener("pointerdown", skip);
        });
      }
    }).observe(viewport, { childList: true });
  }

  // Spark colour follows the active theme's accent
  function accentRGB() {
    const v = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim();
    const m = /^#?([0-9a-f]{6})$/i.exec(v);
    return m ? [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)) : [245, 158, 11];
  }
  // ---------------------------------------------------------------- 4. Click Spark
  function clickSpark() {
    if (reduce) return;
    const canvas = document.createElement("canvas");
    canvas.className = "click-spark";
    canvas.setAttribute("aria-hidden", "true");
    document.body.appendChild(canvas);
    const ctx = canvas.getContext("2d");
    const sparks = [];
    let raf = 0;
    const fit = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    fit();
    window.addEventListener("resize", fit);
    const DURATION = 520;
    const frame = (now) => {
      raf = 0;
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        const k = (now - s.t) / DURATION;
        if (k >= 1) { sparks.splice(i, 1); continue; }
        const e = 1 - Math.pow(1 - k, 3);
        const r0 = s.r0 + e * s.dist, r1 = r0 + s.len * (1 - k);
        ctx.strokeStyle = `rgba(${s.c[0]}, ${s.c[1]}, ${s.c[2]}, ${1 - k})`;
        ctx.lineWidth = 2;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(s.x + Math.cos(s.a) * r0, s.y + Math.sin(s.a) * r0);
        ctx.lineTo(s.x + Math.cos(s.a) * r1, s.y + Math.sin(s.a) * r1);
        ctx.stroke();
      }
      if (sparks.length) raf = requestAnimationFrame(frame);
    };
    document.addEventListener("pointerdown", (e) => {
      const now = performance.now();
      const c = accentRGB();
      for (let i = 0; i < 8; i++) {
        sparks.push({ x: e.clientX, y: e.clientY, a: (i / 8) * Math.PI * 2 + Math.random() * 0.3, r0: 6, dist: 22 + Math.random() * 14, len: 8 + Math.random() * 6, t: now, c });
      }
      if (!raf) raf = requestAnimationFrame(frame);
    }, { passive: true });
  }

  // ---------------------------------------------------------------- start
  function init() {
    // First screen: the verse rises in word by word, once.
    splitText(document.getElementById("hero-sanskrit"), { delay: 100, step: 90 });
    splitText(document.getElementById("hero-translit"), { delay: 650, step: 45 });
    splitText(document.getElementById("hero-translation"), { delay: 1000, step: 40 });

    watchReplies();
    clickSpark();
  }

  // Run after app.js has filled in today's verse.
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => setTimeout(init, 0));
  } else {
    setTimeout(init, 0);
  }
})();
