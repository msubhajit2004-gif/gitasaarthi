// GitaSaarthi site pages: the dashboard and admin views.
// The dashboard reads the signed-in person's saved items (js/account.js keeps them in the
// account); the admin view reads /api/admin/*. Nothing here builds HTML from strings.
(function () {
  "use strict";
  const SVG = "http://www.w3.org/2000/svg";
  const $ = (id) => document.getElementById(id);
  const el = (tag, attrs = {}, text) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    if (text != null) n.textContent = text;
    return n;
  };
  const sv = (tag, attrs = {}, text) => {
    const n = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    if (text != null) n.textContent = text;
    return n;
  };
  const read = (k, fallback) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? fallback : v; } catch (e) { return fallback; } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const dayKey = (d) => { const p = (n) => String(n).padStart(2, "0"); return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()); };
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const fmtShort = (d) => d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
  const fmt = (n) => n.toLocaleString("en-IN");

  // Line chart: values on [min,max] across the full width, hairline grid, labelled ends.
  function lineChart(svg, values, { w, h, min, max, yLabels, xStart, xEnd, padL = 0, xs, total, dots }) {
    const top = 8, bottom = h - 28, left = padL, right = w - 4;
    const y = (v) => bottom - ((v - min) / (max - min)) * (bottom - top);
    // xs: the day index of each value out of `total` days (for charts with gaps); otherwise evenly spaced
    const x = (i) => left + ((xs ? xs[i] : i) / ((xs ? total : values.length) - 1)) * (right - left);
    (yLabels || []).forEach(([v, label]) => {
      svg.appendChild(sv("line", { class: "grid", x1: left, x2: right, y1: y(v), y2: y(v) }));
      if (label) svg.appendChild(sv("text", { x: 0, y: y(v) + 4 }, label));
    });
    if (values.length > 1) svg.appendChild(sv("polyline", { class: "line", points: values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ") }));
    if (dots) values.slice(0, -1).forEach((v, i) => svg.appendChild(sv("circle", { class: "dot small", cx: x(i), cy: y(v), r: 2.5 })));
    const li = values.length - 1;
    svg.appendChild(sv("circle", { class: "dot", cx: x(li), cy: y(values[li]), r: 3.5 }));
    svg.appendChild(sv("text", { x: left, y: h - 6 }, xStart));
    svg.appendChild(sv("text", { x: right, y: h - 6, "text-anchor": "end" }, xEnd));
  }

  // ---------------------------------------------------------------- dashboard
  function dashboard(me) {
    const now = new Date();
    const raw = me && me.name ? String(me.name) : "";
    const name = raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : "";
    const hour = now.getHours();
    const part = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
    $("today").textContent = now.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
    $("greeting").textContent = name ? `Good ${part}, ${name}.` : `Good ${part}.`;
    if (me && me.role === "admin") $("admin-link").hidden = false;   // a convenience only: the server checks the role on every request
    if (name) { $("user-link").textContent = name; $("user-link").setAttribute("aria-label", `Your practice, signed in as ${name}`); }

    // Practice days: a day counts when Krishna gave a practice or Breathe was opened.
    let practised = read("gitasaarthi_practice", []);
    if (!Array.isArray(practised)) practised = [];
    const set = new Set(practised);
    let run = 0, from = new Date(now);
    if (!set.has(dayKey(from))) from = addDays(from, -1);   // today not done yet does not break the run
    for (let d = from; set.has(dayKey(d)); d = addDays(d, -1)) run++;
    let best = 0, cur = 0;
    for (let i = 60; i >= 0; i--) { if (set.has(dayKey(addDays(now, -i)))) { cur++; best = Math.max(best, cur); } else cur = 0; }
    $("streak-now").textContent = run;
    $("streak-unit").textContent = run === 1 ? "day in a row" : "days in a row";
    $("streak-best").textContent = practised.length ? `Longest: ${best} ${best === 1 ? "day" : "days"}` : "Talk to Krishna or breathe for a minute to start";

    // The last 28 days as one thin strip (oldest to newest), and a sentence that says what it shows
    const strip = $("days");
    strip.replaceChildren();
    let last7 = 0, last28 = 0;
    for (let i = 27; i >= 0; i--) {
      const d = addDays(now, -i), k = dayKey(d), on = set.has(k);
      if (on) { last28++; if (i < 7) last7++; }
      const cls = ["tick"]; if (on) cls.push("on"); if (i === 0) cls.push("today");
      strip.appendChild(el("span", { class: cls.join(" "), title: `${d.toDateString()}${on ? ", practised" : ""}` }));
    }
    strip.setAttribute("aria-label", `Practised on ${last7} of the last 7 days and ${last28} of the last 28`);
    $("practice-summary").textContent = last28
      ? `You practised on ${last7} of the last 7 days, and ${last28} of the last 28.`
      : "Nothing recorded in the last 28 days. Talk to Krishna or breathe for a minute, and it starts here.";

    // Mood: 1 Very low to 5 Calm.
    const LABELS = ["Very low", "Low", "Okay", "Good", "Calm"];
    let moods = read("gitasaarthi_moods", {});
    if (!moods || typeof moods !== "object" || Array.isArray(moods)) moods = {};
    function drawMood() {
      const svg = $("mood-chart");
      [...svg.querySelectorAll(":scope > :not(desc)")].forEach((n) => n.remove());
      if (!Object.keys(moods).length) {
        svg.setAttribute("hidden", "");
        $("mood-trend").textContent = "No check-ins yet. Choose how you feel below and your mood line starts today.";
        $("mood-desc").textContent = "No mood check-ins yet.";
        return;
      }
      svg.removeAttribute("hidden");
      // only the days you checked in: no invented values for the days between
      const days = []; for (let i = 29; i >= 0; i--) days.push(dayKey(addDays(now, -i)));
      const xs = [], vals = [];
      days.forEach((k, i) => { if (moods[k] != null) { xs.push(i); vals.push(moods[k]); } });
      if (!vals.length) { svg.setAttribute("hidden", ""); $("mood-trend").textContent = "No check-ins in the last 30 days. Choose how you feel below."; $("mood-desc").textContent = "No mood check-ins in the last 30 days."; return; }
      lineChart(svg, vals, { w: 620, h: 200, min: 1, max: 5, padL: 72, yLabels: LABELS.map((l, i) => [i + 1, l]), xStart: fmtShort(addDays(now, -29)), xEnd: fmtShort(now), xs, total: days.length, dots: true });
      const avg = (a) => a.reduce((s, v) => s + v, 0) / a.length;
      const week = (a, b) => days.slice(a, b).map((k) => moods[k]).filter((v) => v != null);
      const recentV = week(-7), beforeV = week(-14, -7), diff = recentV.length && beforeV.length ? avg(recentV) - avg(beforeV) : null;
      const trend = diff === null ? (vals.length === 1 ? "One check-in so far. A line appears as you add more." : "Not enough check-ins in both weeks to compare yet.")
        : diff > 0.25 ? "This week has been steadier than the one before." : diff < -0.25 ? "This week has been heavier than the one before. Breathing may help tonight." : "This week has been much like the one before.";
      $("mood-trend").textContent = trend;
      $("mood-desc").textContent = `Mood over the last 30 days. ${trend}`;
    }
    drawMood();

    const opts = $("checkin-opts"), todayKey = dayKey(now);
    LABELS.forEach((label, i) => {
      const lab = el("label");
      const input = el("input", { type: "radio", name: "mood", value: String(i + 1) });
      if (Math.round(moods[todayKey] || 0) === i + 1) input.checked = true;
      lab.append(input, el("span", {}, label));
      input.addEventListener("change", () => {
        moods[todayKey] = i + 1;
        write("gitasaarthi_moods", moods);
        drawMood();
        $("checkin-saved").textContent = `Saved for today: ${label}.`;
      });
      opts.appendChild(lab);
    });

    // The last conversation, first under "Continue": opens the app on that feeling.
    const last = read("gitasaarthi_last", null);
    const list = document.querySelector("#cont-title + .rows");
    const arche = typeof WISDOM_ARCHETYPES !== "undefined" ? WISDOM_ARCHETYPES.find((a) => last && a.id === last.id) : null;
    if (list && arche) {
      const days = Math.round((new Date(now.toDateString()) - new Date(new Date(last.at).toDateString())) / 86400000);
      const when = days <= 0 ? "today" : days === 1 ? "yesterday" : days < 7 ? `${days} days ago` : new Date(last.at).toLocaleDateString(undefined, { day: "numeric", month: "long" });
      const a = el("a", { href: `index.html?feel=${encodeURIComponent(arche.id)}` });
      a.append(el("b", {}, "Talk about it again"), el("span", {}, `${arche.title}, ${when}`));
      const li = el("li"); li.appendChild(a);
      list.insertBefore(li, list.firstChild);
    }

    // Today's verse: same choice as the app's Verse of the day (day of the month).
    if (typeof DAILY_SHLOKAS !== "undefined" && DAILY_SHLOKAS.length) {
      const s = DAILY_SHLOKAS[(now.getDate() - 1) % DAILY_SHLOKAS.length];
      const m = String(s.chapterVerse).match(/Chapter\s+(\d+),\s*Verse\s+([\d\-–]+)/i);
      $("v-ref").textContent = m ? `Bhagavad Gita ${m[1]}.${m[2]}` : s.chapterVerse;
      $("v-sa").textContent = s.sanskrit;
      $("v-en").textContent = s.translation;
    }
  }

  // -------------------------------------------------------------------- admin
  const when = (isoStr) => {
    if (!isoStr) return "Never";
    const d = new Date(isoStr), today = new Date();
    const days = Math.round((new Date(today.toDateString()) - new Date(d.toDateString())) / 86400000);
    const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    if (days <= 0) return `Today ${time}`;
    if (days === 1) return `Yesterday ${time}`;
    return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  };
  const change = (now, before) => {
    if (before == null) return "";
    const d = now - before;
    if (d === 0) return "Same as last week";
    return `${Math.abs(d)} ${d > 0 ? "more" : "fewer"} than last week`;
  };

  async function admin(me) {
    const api = window.GSAccount.api;
    const now = new Date();
    $("period").textContent = `Week of ${fmtShort(addDays(now, -6))} to ${fmtShort(now)}`;
    if (me && me.name) $("admin-name").textContent = me.name;

    const titles = {};
    if (typeof WISDOM_ARCHETYPES !== "undefined") WISDOM_ARCHETYPES.forEach((a) => { titles[a.id] = a.title; });

    const stats = await api("GET", "/api/admin/stats");
    const figures = [
      ["People with an account", stats.users, stats.new_this_week ? `${stats.new_this_week} new this week` : "No new accounts this week"],
      ["Active this week", stats.active_this_week, "Signed in during the last 7 days"],
      ["Conversations", stats.conversations_this_week, change(stats.conversations_this_week, stats.conversations_last_week)],
      ["Safe Harbor shown", stats.crisis_this_week, change(stats.crisis_this_week, stats.crisis_last_week)],
    ];
    const dl = $("figures");
    dl.replaceChildren();
    figures.forEach(([label, n, chg]) => {
      const box = el("div");
      const dd = el("dd", { class: "num" }, fmt(n));
      if (chg) dd.appendChild(el("span", { class: "chg" }, chg));
      box.append(el("dt", {}, label), dd);
      dl.appendChild(box);
    });

    const conv = stats.per_day.map((d) => d.n);
    const top = Math.max(4, Math.ceil(Math.max(...conv) / 4) * 4);
    lineChart($("conv-chart"), conv, {
      w: 760, h: 260, min: 0, max: top, padL: 44,
      yLabels: [[0, "0"], [top / 2, String(top / 2)], [top, String(top)]],
      xStart: fmtShort(addDays(now, -27)), xEnd: fmtShort(now),
    });
    const total = conv.reduce((a, b) => a + b, 0);
    $("conv-desc").textContent = `${total} conversations over 28 days, ${Math.max(...conv)} on the busiest day.`;

    const bars = $("bars");
    bars.replaceChildren();
    if (!stats.topics.length) {
      bars.appendChild(el("li", { class: "muted" }, "No conversations this week yet."));
    } else {
      const max = stats.topics[0].n;
      stats.topics.forEach(({ topic, n }) => {
        const li = el("li");
        const track = el("span", { class: "track", "aria-hidden": "true" });
        const fill = el("span", { class: "fill" }); fill.style.width = `${(n / max) * 100}%`;
        track.appendChild(fill);
        li.append(el("span", {}, titles[topic] || topic), track, el("span", { class: "n num" }, fmt(n)));
        bars.appendChild(li);
      });
    }

    const rr = $("review-rows");
    const PAGE = 50;
    function moreLink(after, load) {
      const a = el("a", { class: "link", href: "#", hidden: "" }, "Show more");
      a.addEventListener("click", (e) => { e.preventDefault(); load(); });
      after.after(a);
      return a;
    }
    function reviewRow(r) {
      const tr = el("tr");
      const status = el("td", { class: r.reviewed ? "status-done" : "status-open" }, r.reviewed ? "Reviewed" : "Not reviewed");
      const act = el("td", { class: "r" });
      if (!r.reviewed) {
        const btn = el("button", { class: "link-plain gold", type: "button" }, "Mark reviewed");
        btn.style.cssText = "background:none;border:0;cursor:pointer;min-height:44px;font:inherit";
        btn.addEventListener("click", async () => {
          btn.disabled = true;
          try {
            await api("POST", `/api/admin/reviews/${r.id}`, {});
            status.textContent = "Reviewed"; status.className = "status-done"; btn.remove();
          } catch (e) { btn.disabled = false; btn.textContent = "Try again"; }
        });
        act.appendChild(btn);
      }
      const who = el("td", {}, r.name);
      who.appendChild(el("span", { class: "quiet", style: "display:block;font-size:14px" }, r.email));
      tr.append(el("td", { class: "num" }, when(r.created_at)), who, el("td", {}, "Crisis words, Safe Harbor shown"), status, act);
      return tr;
    }
    let rOffset = 0, rLoading = false;
    const rMore = moreLink(rr.closest("table") || rr, () => drawReviews());
    async function drawReviews() {
      if (rLoading) return;
      rLoading = true;
      try {
        const { reviews, total } = await api("GET", `/api/admin/reviews?limit=${PAGE}&offset=${rOffset}`);
        if (!rOffset) rr.replaceChildren();
        if (!rOffset && !reviews.length) {
          const tr = el("tr");
          tr.appendChild(el("td", { colspan: "5", class: "muted" }, "Nothing to review. When Safe Harbor is shown to someone, it appears here."));
          rr.appendChild(tr);
        }
        reviews.forEach((r) => rr.appendChild(reviewRow(r)));
        rOffset += reviews.length;
        rMore.hidden = !(reviews.length && rOffset < total);
      } finally { rLoading = false; }
    }
    await drawReviews();

    const ur = $("user-rows");
    let seq = 0, uOffset = 0, uQuery = "", uShown = 0;
    let uMore = null;
    async function drawUsers(q, more) {
      const mine = ++seq;
      if (!more) { uOffset = 0; uQuery = q; }
      const { users, total } = await api("GET", `/api/admin/users?limit=${PAGE}&offset=${uOffset}&q=` + encodeURIComponent(uQuery));
      if (mine !== seq) return;          // a newer search already answered
      if (!more) { ur.replaceChildren(); uShown = 0; }
      users.forEach((u) => {
        const tr = el("tr");
        const who = el("td", {}, u.name);
        who.appendChild(el("span", { class: "quiet", style: "display:block;font-size:14px" }, u.email));
        tr.append(who, el("td", { class: "num quiet" }, when(u.created_at)), el("td", { class: "quiet" }, when(u.last_active_at)),
          el("td", { class: "r num" }, String(u.streak)), el("td", { class: u.role === "admin" ? "status-done" : "" }, u.role === "admin" ? "Admin" : "Member"));
        ur.appendChild(tr);
      });
      uOffset += users.length; uShown += users.length;
      if (!uShown) { const tr = el("tr"); tr.appendChild(el("td", { colspan: "5", class: "muted" }, "No one matches that search.")); ur.appendChild(tr); }
      $("pager").textContent = uQuery ? `${uShown} shown of ${fmt(total)}` : `${uShown} of ${fmt(total)}${uShown < total ? ", newest first" : ""}`;
      if (!uMore) uMore = moreLink($("pager"), () => drawUsers(uQuery, true));
      uMore.hidden = users.length < PAGE;
    }
    let t = null;
    $("user-search").addEventListener("input", (e) => { clearTimeout(t); const q = e.target.value.trim(); t = setTimeout(() => drawUsers(q), 200); });
    await drawUsers("");
  }

  window.GSSite = { dashboard, admin };
})();
