/* Plate: layout DOM changes. */
/* Composition B "Plate": DOM restructuring, injected after load. Idempotent. */
(function () {
  "use strict";
  var root = document.documentElement;
  if (root.getAttribute("data-plate") === "1") return;
  var card = document.getElementById("welcome-hero-card");
  var app = document.querySelector(".app-container");
  if (!card || !app) return;
  root.setAttribute("data-plate", "1");

  var el = function (tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text) n.textContent = text;
    return n;
  };
  var $ = function (s) { return document.querySelector(s); };

  // ---- NEW COPY (not in the production app): Krishna's first line, already written, as the page's lead.
  var lead = el("h2", "plate-lead", "What is weighing on you today?");
  lead.id = "plate-lead";
  card.insertBefore(lead, card.firstChild);

  // ---- The verse of the day becomes a quiet quote (existing nodes are moved, ids kept so app.js still fills them).
  var verse = el("div", "plate-verse");
  ["hero-sanskrit", "hero-translit", "hero-translation", "hero-ref"].forEach(function (id) {
    var n = document.getElementById(id);
    if (n) verse.appendChild(n);
  });
  card.appendChild(verse);
  var ref = document.getElementById("hero-ref");
  if (ref) ref.textContent = ref.textContent.replace(/^\s*Today.s verse:\s*/i, "");

  // ---- Feelings: "I feel ..." as a wrapping sentence. The real .compass-chip nodes are MOVED (handlers intact).
  var chips = Array.prototype.slice.call(document.querySelectorAll(".compass-chip"));
  var sentence = el("p", "plate-feel");
  sentence.id = "plate-feel";
  sentence.appendChild(el("span", "plate-feel-lead", "I feel"));
  var VISIBLE = 8;
  var extras = [];
  var hasMore = chips.length > VISIBLE;
  var sep = function () { var s = el("span", "plate-sep", "/"); s.setAttribute("aria-hidden", "true"); return s; };
  // Each feeling and the slash after it form one unbreakable group, so no line starts with "/".
  chips.forEach(function (c, i) {
    sentence.appendChild(document.createTextNode(" "));
    var item = el("span", "plate-item");
    item.appendChild(c);
    if (i < chips.length - 1 || hasMore) { item.appendChild(document.createTextNode(" ")); item.appendChild(sep()); }
    sentence.appendChild(item);
    if (i >= VISIBLE) { item.hidden = true; extras.push(item); }
  });
  if (hasMore) {
    sentence.appendChild(document.createTextNode(" "));
    var more = el("button", "plate-more", "and more");   // new control
    more.type = "button";
    more.setAttribute("aria-expanded", "false");
    more.setAttribute("aria-controls", "plate-feel");
    more.addEventListener("click", function () {
      var open = more.getAttribute("aria-expanded") !== "true";
      more.setAttribute("aria-expanded", String(open));
      more.textContent = open ? "fewer" : "and more";
      extras.forEach(function (n) { n.hidden = !open; });
    });
    sentence.appendChild(more);
  }
  card.insertBefore(sentence, verse);

  // ---- Colophon: pages and settings as one line of small type at the foot of the column (nodes moved).
  var colophon = el("footer", "plate-colophon");
  var links = el("nav", "plate-links");
  links.setAttribute("aria-label", "Pages and settings");
  ["nav-pranayama-btn", "nav-daily-shloka-btn", "nav-journal-btn", "audio-bar", "nav-theme-btn", "nav-settings-btn"].forEach(function (id) {
    var n = document.getElementById(id);
    if (n) links.appendChild(n);
  });
  colophon.appendChild(links);
  var meta = $(".composer-meta-footer");
  if (meta) colophon.appendChild(meta);
  app.appendChild(colophon);

  // ---- Chat: the speaker label reads plainly "Krishna".
  var vp = document.getElementById("chat-viewport");
  if (vp) {
    var fix = function () {
      var t = vp.querySelectorAll(".speaker-title");
      for (var i = 0; i < t.length; i++) if (t[i].textContent.trim() === "Lord Krishna") t[i].textContent = "Krishna";
    };
    new MutationObserver(fix).observe(vp, { childList: true, subtree: true });
    fix();
  }
})();

/* Links from the site pages (dashboard) open a window in the app: index.html#safe-harbor, #journal, #breathe, #verse */
(function () {
  var map = { "#safe-harbor": "nav-safe-harbor-btn", "#journal": "nav-journal-btn", "#breathe": "nav-pranayama-btn", "#verse": "nav-daily-shloka-btn" };
  function openFromHash() {
    var id = map[location.hash];
    var btn = id && document.getElementById(id);
    if (!btn) return;
    // wait for the intro to hand the page over, then open the window
    var tries = 0;
    (function go() {
      var busy = document.documentElement.classList.contains("intro-active") || document.querySelector(".app-container[inert]");
      if (busy && tries++ < 40) return setTimeout(go, 200);
      btn.click();
    })();
  }
  window.addEventListener("hashchange", openFromHash);
  if (document.readyState === "complete") openFromHash(); else window.addEventListener("load", openFromHash);
})();

/* Chat side page: on wide windows the conversation gets a facing page with today's verse
   and the feelings, so a new topic is one click away. Built from the home nodes; clicks
   go to the real feeling buttons so app.js handles them as before. Idempotent. */
(function () {
  var app = document.querySelector(".app-container");
  var card = document.getElementById("welcome-hero-card");
  if (!app || !card || document.getElementById("plate-aside")) return;
  var el = function (tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text) n.textContent = text; return n; };

  var aside = el("aside", "plate-aside");
  aside.id = "plate-aside";
  aside.setAttribute("aria-label", "Today's verse and other feelings");

  var verse = el("figure", "aside-verse");
  var ref = el("figcaption", "aside-ref");
  var sa = el("p", "aside-sa"); sa.lang = "sa";
  var en = el("p", "aside-en");
  verse.appendChild(ref); verse.appendChild(sa); verse.appendChild(en);
  aside.appendChild(verse);

  var feelTitle = el("h2", "aside-title", "Talk about something else");
  aside.appendChild(feelTitle);
  var list = el("ul", "aside-feelings");
  var chips = Array.prototype.slice.call(document.querySelectorAll(".compass-chip"));
  var VISIBLE = 8, extras = [], buttons = [];
  chips.forEach(function (c, i) {
    var li = el("li");
    var b = el("button", "aside-feel", c.textContent.trim().toLowerCase());
    b.type = "button";
    b.addEventListener("click", function () { c.click(); sync(); });
    buttons.push([b, c]);
    li.appendChild(b);
    if (i >= VISIBLE) { li.hidden = true; extras.push(li); }
    list.appendChild(li);
  });
  aside.appendChild(list);
  if (chips.length > VISIBLE) {
    var more = el("button", "aside-more", "Show all feelings");
    more.type = "button";
    more.setAttribute("aria-expanded", "false");
    more.addEventListener("click", function () {
      var open = more.getAttribute("aria-expanded") !== "true";
      more.setAttribute("aria-expanded", String(open));
      more.textContent = open ? "Show fewer" : "Show all feelings";
      extras.forEach(function (n) { n.hidden = !open; });
    });
    aside.appendChild(more);
  }
  app.appendChild(aside);

  function text(id) { var n = document.getElementById(id); return n ? n.textContent.trim() : ""; }
  function sync() {
    ref.textContent = text("hero-ref").replace(/^\s*Today.s verse:\s*/i, "Today's verse, ");
    sa.textContent = text("hero-sanskrit");
    en.textContent = text("hero-translation");
    buttons.forEach(function (p) {
      if (p[1].classList.contains("active")) p[0].setAttribute("aria-current", "true");
      else p[0].removeAttribute("aria-current");
    });
  }
  new MutationObserver(sync).observe(card, { attributes: true, attributeFilter: ["style"] });
  chips.forEach(function (c) { new MutationObserver(sync).observe(c, { attributes: true, attributeFilter: ["class"] }); });
  sync();
})();

/* Home: "Pick up where you left off". Shown only when a past conversation was remembered. */
(function () {
  function render() {
  var feel = document.getElementById("plate-feel");
  if (!feel || document.getElementById("plate-last")) return;
  var last = null;
  try { last = JSON.parse(localStorage.getItem("gitasaarthi_last") || "null"); } catch (e) {}
  if (!last || !last.id) return;
  var chip = document.querySelector('.compass-chip[data-archetype="' + last.id + '"]');
  if (!chip) return;

  function when(t) {
    var d = new Date(t), now = new Date();
    var day = function (x) { return new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime(); };
    var diff = Math.round((day(now) - day(d)) / 86400000);
    if (diff <= 0) return "earlier today";
    if (diff === 1) return "yesterday";
    if (diff < 7) return "on " + d.toLocaleDateString(undefined, { weekday: "long" });
    return "on " + d.toLocaleDateString(undefined, { day: "numeric", month: "long" });
  }

  var p = document.createElement("p");
  p.className = "plate-last"; p.id = "plate-last";
  p.appendChild(document.createTextNode("Last time you talked about "));
  var topic = document.createElement("span");
  topic.className = "plate-last-topic";
  topic.textContent = chip.textContent.trim().toLowerCase();
  p.appendChild(topic);
  p.appendChild(document.createTextNode(", " + when(last.at) + ". "));
  var again = document.createElement("button");
  again.type = "button"; again.className = "plate-last-btn"; again.textContent = "Talk about it again";
  again.addEventListener("click", function () { chip.click(); });
  p.appendChild(again);
  feel.parentNode.insertBefore(p, feel.nextSibling);
  }
  window.__plateLast = render;
  render();
})();

/* Chat side page: the practice from this conversation as a checklist, and two shortcuts. */
(function () {
  var aside = document.getElementById("plate-aside");
  var vp = document.getElementById("chat-viewport");
  if (!aside || !vp || document.getElementById("aside-practice")) return;
  var el = function (tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text) n.textContent = text; return n; };

  var practice = el("section", "aside-practice"); practice.id = "aside-practice"; practice.hidden = true;
  var pTitle = el("h2", "aside-title", "Your practice");
  var pName = el("p", "aside-practice-name");
  var pList = el("ul", "aside-steps");
  var pCount = el("p", "aside-count"); pCount.setAttribute("aria-live", "polite");
  practice.appendChild(pTitle); practice.appendChild(pName); practice.appendChild(pList); practice.appendChild(pCount);

  var actions = el("div", "aside-actions");
  var keep = el("button", "aside-action", "Keep this verse in your journal"); keep.type = "button"; keep.hidden = true;
  var breathe = el("button", "aside-action", "Breathe for a minute"); breathe.type = "button";
  actions.appendChild(keep); actions.appendChild(breathe);

  aside.insertBefore(actions, aside.firstChild);
  aside.insertBefore(practice, aside.firstChild);

  // A slow breathing circle: in for four, out for four. Decoration-free: it only paces the breath.
  var breath = el("div", "aside-breath");
  breath.setAttribute("role", "img");
  breath.setAttribute("aria-label", "A slow circle that grows as you breathe in and shrinks as you breathe out");
  var orb = el("div", "aside-orb");
  var cue = el("p", "aside-cue");
  var cin = el("span", "cue-in", "Breathe in"), cout = el("span", "cue-out", "Breathe out");
  cue.appendChild(cin); cue.appendChild(cout);
  breath.appendChild(orb); breath.appendChild(cue);
  aside.appendChild(breath);

  var steps = [], done = {}, topic = null;
  function count() {
    var n = steps.filter(function (t) { return done[t]; }).length;
    pCount.textContent = n === steps.length && n > 0 ? "All done for now." : n + " of " + steps.length + " done";
  }
  function draw() {
    pList.textContent = "";
    steps.forEach(function (t) {
      var li = el("li");
      var label = el("label", "aside-step");
      var box = document.createElement("input"); box.type = "checkbox"; box.checked = !!done[t];
      box.addEventListener("change", function () { done[t] = box.checked; label.classList.toggle("is-done", box.checked); count(); });
      label.classList.toggle("is-done", !!done[t]);
      // "Step 1 (Name the Projection): Say aloud ..." becomes a short name and its instruction
      var m = /^\s*Step\s*\d+\s*\(([^)]+)\)\s*:\s*([\s\S]*)$/i.exec(t);
      var body = el("span", "aside-step-text");
      if (m) { body.appendChild(el("b", "aside-step-name", m[1])); body.appendChild(el("span", "aside-step-detail", m[2])); }
      else body.textContent = t;
      label.appendChild(box); label.appendChild(body);
      li.appendChild(label); pList.appendChild(li);
    });
    practice.hidden = steps.length === 0;
    aside.classList.toggle("has-practice", steps.length > 0);
    count();
  }
  function latestSave() {
    var all = vp.querySelectorAll(".save-journal-btn");
    return all.length ? all[all.length - 1] : null;
  }
  function syncKeep() {
    var b = latestSave();
    keep.hidden = !b;
    if (b) { keep.disabled = b.disabled; keep.textContent = b.disabled ? "Saved in your journal" : "Keep this verse in your journal"; }
  }
  keep.addEventListener("click", function () { var b = latestSave(); if (b && !b.disabled) b.click(); syncKeep(); });
  breathe.addEventListener("click", function () { var b = document.getElementById("nav-pranayama-btn"); if (b) b.click(); });
  vp.addEventListener("click", function (e) { if (e.target.closest && e.target.closest(".save-journal-btn")) setTimeout(syncKeep, 0); });

  document.addEventListener("gs:turn", function (e) {
    var d = e.detail || {};
    if (d.kind === "phase1" || (d.archetypeId && d.archetypeId !== topic)) { steps = []; done = {}; pName.textContent = ""; }
    if (d.archetypeId) topic = d.archetypeId;
    var boxes = vp.querySelectorAll(".cbt-practice-box");
    var last = boxes.length ? boxes[boxes.length - 1] : null;
    if (last && (d.kind === "phase2" || d.kind === "followup")) {
      var title = last.querySelector(".cbt-title");
      var name = title ? title.textContent.replace(/^\s*Modern CBT practice:\s*/i, "").trim() : "";
      if (name && !/^One step for now$/i.test(name)) pName.textContent = name;
      Array.prototype.forEach.call(last.querySelectorAll(".cbt-step-item"), function (s) {
        var t = s.textContent.trim();
        if (t && steps.indexOf(t) < 0) steps.push(t);
      });
    }
    draw(); syncKeep();
  });
  // a fresh start (Clear conversation) empties the list
  new MutationObserver(function () {
    if (!vp.querySelector(".krishna-counsel-card")) { steps = []; done = {}; topic = null; draw(); syncKeep(); }
  }).observe(vp, { childList: true });
})();

/* Practice days, the streak on home, and the chapter of today's verse. Idempotent. */
(function () {
  if (document.documentElement.getAttribute("data-plate-fill2") === "1") return;
  document.documentElement.setAttribute("data-plate-fill2", "1");
  var KEY = "gitasaarthi_practice";                       // same key and day format the dashboard reads
  var dayKey = function (d) { var p = function (n) { return String(n).padStart(2, "0"); }; return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()); };
  function readDays() { try { var v = JSON.parse(localStorage.getItem(KEY) || "[]"); return Array.isArray(v) ? v : []; } catch (e) { return []; } }
  function markToday() {
    var days = readDays(), k = dayKey(new Date());
    if (days.indexOf(k) < 0) { days.push(k); try { localStorage.setItem(KEY, JSON.stringify(days.slice(-400))); } catch (e) {} }
  }
  // a day counts as practised when a practice is given, or when Breathe is opened
  document.addEventListener("gs:turn", function (e) { var k = e.detail && e.detail.kind; if (k === "phase2" || k === "followup") markToday(); });
  var br = document.getElementById("nav-pranayama-btn");
  if (br) br.addEventListener("click", markToday);

  // streak: consecutive days ending today (or yesterday, so it does not drop to 0 before today's practice)
  function renderStreak() {
  var old = document.querySelector(".plate-streak"); if (old) old.remove();
  var set = {}; readDays().forEach(function (d) { set[d] = true; });
  var d = new Date(), n = 0, today = !!set[dayKey(d)];
  if (!today) d.setDate(d.getDate() - 1);
  while (set[dayKey(d)]) { n++; d.setDate(d.getDate() - 1); }
  if (n > 0) {
    var host = document.getElementById("plate-last");
    if (!host) {
      host = document.createElement("p"); host.className = "plate-last"; host.id = "plate-last";
      var feel = document.getElementById("plate-feel");
      if (feel) feel.parentNode.insertBefore(host, feel.nextSibling);
    }
    var s = document.createElement("span"); s.className = "plate-streak";
    s.appendChild(document.createTextNode(n === 1 ? (today ? "You practised today. " : "You practised yesterday. ") : "You have practised " + n + " days in a row. "));
    var a = document.createElement("a"); a.href = "dashboard.html"; a.textContent = "See your practice";
    s.appendChild(a); host.appendChild(s);
  }
  }
  window.__plateStreak = renderStreak;
  renderStreak();

  // the chapter today's verse comes from (standard chapter names of the Bhagavad Gita)
  var CH = ["", "Arjuna's grief", "knowledge of the self", "the path of action", "knowledge and the giving up of action",
    "renunciation of action", "meditation", "knowledge and wisdom", "the imperishable", "the royal knowledge",
    "the divine glories", "the vision of the universal form", "devotion", "the field and the knower of the field",
    "the three qualities of nature", "the supreme person", "the divine and the demonic", "the three kinds of faith",
    "freedom through letting go"];
  var verse = document.querySelector(".plate-verse");
  var ref = document.getElementById("hero-ref");
  if (!verse || !ref) return;
  var line = document.createElement("p"); line.className = "plate-chapter"; line.hidden = true;
  verse.appendChild(line);
  function chapter() {
    var m = /chapter\s*(\d+)/i.exec(ref.textContent) || /(\d+)\s*[.:]\s*\d+/.exec(ref.textContent);
    var c = m ? parseInt(m[1], 10) : 0;
    if (!CH[c]) { line.hidden = true; return; }
    line.textContent = "From chapter " + c + ", ";
    var i = document.createElement("i"); i.textContent = CH[c];
    line.appendChild(i);
    line.hidden = false;
  }
  new MutationObserver(chapter).observe(ref, { childList: true, characterData: true, subtree: true });
  chapter();
})();

/* Account links in the colophon: your practice (dashboard) and sign out. Idempotent. */
(function () {
  var links = document.querySelector(".plate-colophon .plate-links");
  if (!links || document.getElementById("nav-practice-link")) return;
  var practice = document.createElement("a");
  practice.className = "nav-btn"; practice.id = "nav-practice-link"; practice.href = "dashboard.html";
  var t1 = document.createElement("span"); t1.className = "btn-text"; t1.textContent = "Your practice";
  practice.appendChild(t1);
  var out = document.createElement("button");
  out.type = "button"; out.className = "nav-btn"; out.id = "nav-sign-out"; out.setAttribute("data-sign-out", "");
  var t2 = document.createElement("span"); t2.className = "btn-text"; t2.textContent = "Sign out";
  out.appendChild(t2);
  var priv = document.createElement("a");
  priv.className = "nav-btn"; priv.id = "nav-privacy-link"; priv.href = "/privacy.html";
  var t3 = document.createElement("span"); t3.className = "btn-text"; t3.textContent = "Privacy";
  priv.appendChild(t3);
  links.appendChild(practice);
  links.appendChild(priv);
  links.appendChild(out);
})();

/* index.html?feel=anxiety (from the dashboard): once the page is ready, start on that feeling. */
(function () {
  var id = new URLSearchParams(location.search).get("feel");
  if (!id) return;
  var chip = document.querySelector('.compass-chip[data-archetype="' + id.replace(/[^a-z_]/g, "") + '"]');
  if (!chip) return;
  try { history.replaceState(null, "", location.pathname + location.hash); } catch (e) {}
  // the app finishes starting on load; click after that
  var go = function () { setTimeout(function () { chip.click(); }, 150); };
  if (document.readyState === "complete") go(); else window.addEventListener("load", go);
})();

/* After the account's items are copied in, redraw what was built from them. */
(function () {
  if (!window.GSAccount || !window.GSAccount.ready) return;
  window.GSAccount.ready.then(function () {
    var old = document.getElementById("plate-last"); if (old) old.remove();
    if (window.__plateLast) window.__plateLast();
    if (window.__plateStreak) window.__plateStreak();
  }).catch(function () {});
})();
