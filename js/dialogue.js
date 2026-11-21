// ============================================================================
// GitaSaarthi conversation engine (offline). Pure functions, no DOM.
// A session moves: start -> phase 1 (two questions) -> phase 2 (verse + CBT)
// -> follow-ups (new verses, one step at a time) -> close. Crisis language is
// checked before anything else on every turn. Nothing shown is repeated.
// Loaded in the browser before app.js (window.Dialogue) and by Node tests.
// ============================================================================
(function (root) {
  "use strict";

  // ---- Words -------------------------------------------------------------
  const STOP = new Set(("a an the i me my am is are was were be been to of in on at for and or but so it its " +
    "this that with about from by as just very really too much so feel feeling felt like im i'm ive i've " +
    "do does did have has had can").split(" "));
  // Negations ("no", "not", "cant") are kept: "no friends" must not match every "friends".

  function stem(w) {
    for (const suf of ["ness", "ful", "ing", "ed", "es", "s"]) {
      if (w.length - suf.length >= 3 && w.endsWith(suf)) return w.slice(0, -suf.length);
    }
    return w;
  }
  function words(text) {
    return String(text || "").toLowerCase().replace(/[’']/g, "").split(/[^a-z]+/).filter(Boolean);
  }
  function contentStems(text) {
    return words(text).filter(w => !STOP.has(w)).map(stem);
  }

  // ---- Crisis ------------------------------------------------------------
  const CRISIS = [
    /\bsuicid/, /\bkill(ing)? my ?self\b/, /\bend(ing)? (my|this) life\b/, /\bend it all\b/,
    /\btake my (own )?life\b/, /\bself[- ]?harm/, /\bhurt(ing)? my ?self\b/, /\bcut(ting)? my ?self\b/,
    /\b(dont|do not|no longer) want to (live|be alive|exist|be here)\b/, /\bwant to die\b/,
    /\bbetter off dead\b/, /\bno reason to (live|go on)\b/, /\bnot worth living\b/,
  ];
  function detectCrisis(text) {
    const t = String(text || "").toLowerCase().replace(/[’']/g, "");
    return CRISIS.some(re => re.test(t));
  }

  // ---- Matching ----------------------------------------------------------
  // A keyword counts when all of its content words appear in the message (as stems).
  function scoreArchetype(archetype, stems) {
    let score = 0;
    for (const kw of archetype.keywords || []) {
      const parts = contentStems(kw);
      if (parts.length && parts.every(p => stems.has(p))) score += kw.length;
    }
    return score;
  }
  function matchArchetype(text, archetypes) {
    const stems = new Set(contentStems(text));
    const ranked = archetypes.map(a => ({ archetype: a, score: scoreArchetype(a, stems) }))
      .sort((x, y) => y.score - x.score);
    const best = ranked[0] && ranked[0].score > 0 ? ranked[0] : null;
    return { archetype: best ? best.archetype : null, score: best ? best.score : 0, ranked };
  }

  // ---- Verses ------------------------------------------------------------
  // "Bhagavad Gita 6.26 & 6.19" -> ["6.26","6.19"]; "Chapter 6, Verse 16-17" -> ["6.16-17"]
  function verseParts(ref) {
    const s = String(ref || "");
    const ch = s.match(/Chapter\s+(\d+),\s*Verse\s+([\d\-–]+)/i);
    if (ch) return [ch[1] + "." + ch[2].replace("–", "-")];
    return (s.match(/\d+\.[\d\-–]+/g) || []).map(p => p.replace("–", "-"));
  }
  function verseKey(ref) { return verseParts(ref).join("&"); }

  function versePool(lib) {
    const pool = [];
    for (const a of lib.archetypes) {
      const sh = a.phase2 && a.phase2.shloka;
      if (sh) pool.push({ reference: sh.reference, sanskrit: sh.sanskrit, transliteration: sh.transliteration,
        translation: sh.translation, insight: sh.insight || "", owner: a.id });
    }
    for (const d of lib.dailyShlokas || []) {
      pool.push({ reference: "Bhagavad Gita " + verseParts(d.chapterVerse)[0], sanskrit: d.sanskrit,
        transliteration: d.transliteration, translation: d.translation, insight: d.meditation || "", owner: null });
    }
    return pool;
  }

  // ---- Session -----------------------------------------------------------
  function createSession() {
    return { phase: 0, archetypeId: null, shownParts: [], shownLines: [], offered: [], followups: 0, clarifies: 0, stepIdx: 0, lastAnswer: "" };
  }
  const rememberLine = (s, line) => { s.shownLines.push(line); return line; };
  const seenVerse = (s, ref) => verseParts(ref).some(p => s.shownParts.includes(p));
  const markVerse = (s, ref) => { for (const p of verseParts(ref)) if (!s.shownParts.includes(p)) s.shownParts.push(p); };
  const trim = (t, n = 80) => { t = String(t || "").trim().replace(/\s+/g, " "); return t.length > n ? t.slice(0, n - 1).trimEnd() + "…" : t; };
  const byId = (lib, id) => lib.archetypes.find(a => a.id === id) || null;

  // New copy (UI wording, not scripture): short lines that carry the user's own words.
  const RETURN_LINES = [
    (a) => `We come back to ${a.title.toLowerCase()}. Let us look at it from where you stand now.`,
    (a) => `This weight again. That is all right; it often returns before it loosens.`,
    (a) => `Let us sit with ${a.title.toLowerCase()} once more, more slowly this time.`,
  ];
  const FOLLOW_INTROS = [
    (e) => e ? `You said “${e}”. Here is another verse to sit with.` : "Here is another verse to sit with.",
    (e) => e ? `“${e}”. Let this verse meet you there.` : "Let this verse meet you where you are.",
    (e) => e ? `I hear “${e}”. Another teaching, for this moment.` : "Another teaching, for this moment.",
    (e) => e ? `About “${e}”: read this one slowly.` : "Read this one slowly.",
  ];
  const FOLLOW_CLOSINGS = [
    "Try only this one step now, then tell me what changed, even a little.",
    "Take just this step. Tell me how it went, or what got in the way.",
    "One small step is enough for now. What do you notice afterwards?",
  ];
  const CLARIFY_PROMPTS = [
    "I want to understand you rightly. Which of these is closest?",
    "Say a little more, or choose what feels nearest:",
    "Which of these comes closest to what you are carrying?",
  ];
  const CLOSE_LINES = [
    "I am glad there is a little more space in you now. Rest in it. If you like, breathe with me for a minute, or keep this verse in your journal.",
    "Good. Let that steadiness stay a while. You can return any time, or breathe for a minute before you go.",
    "Stillness found once can be found again. Breathe with me if you wish, or save what helped.",
  ];
  const pickUnused = (s, options) => options.find(o => !s.shownLines.includes(o)) || null;

  function phase1Payload(s, a, lib) {
    let ack = a.phase1.acknowledgment;
    if (s.shownLines.includes(ack)) {
      ack = pickUnused(s, RETURN_LINES.map(f => f(a))) || `${a.title}: we begin again.`;
    }
    rememberLine(s, ack);
    return { archetype: a, acknowledgment: ack, question1: a.phase1.question1, question2: a.phase1.question2, quickPills: a.phase1.quickPills };
  }

  function startPhase1(s, a, lib) {
    s.phase = 1; s.archetypeId = a.id; s.stepIdx = 0;
    return { kind: "phase1", payload: phase1Payload(s, a, lib) };
  }

  function phase2(s, a, answer, lib) {
    s.phase = 2; s.lastAnswer = answer;
    const p2 = a.phase2;
    const echo = trim(answer);
    const intro = rememberLine(s, echo ? `You named “${echo}”.` : `You have looked at ${a.title.toLowerCase()} honestly.`);
    markVerse(s, p2.shloka.reference);
    return { kind: "phase2", payload: Object.assign({}, p2, { archetype: a, echo, intro }) };
  }

  // echoText is quoted back (typed replies only); rankText steers which verse comes next.
  function followup(s, a, echoText, lib, rankText) {
    s.phase = 3;
    const echo = trim(echoText, 60);
    const rank = rankText != null ? rankText : echoText;
    const want = new Set([...contentStems(rank), ...contentStems((a.keywords || []).join(" ")), ...contentStems(a.title)]);
    const candidates = versePool(lib).filter(v => !seenVerse(s, v.reference))
      .map((v, i) => {
        const hay = new Set(contentStems(v.translation + " " + v.insight));
        let score = v.owner === a.id ? 50 : 0;
        for (const w of want) if (hay.has(w)) score += 3;
        return { v, score, i };
      })
      .sort((x, y) => y.score - x.score || x.i - y.i);
    const steps = (a.phase2.cbtPractice && a.phase2.cbtPractice.steps) || [];
    const step = steps.length ? steps[s.stepIdx % steps.length] : "";
    s.stepIdx++;
    const n = s.followups++;
    let intro = FOLLOW_INTROS[n % FOLLOW_INTROS.length](echo);
    if (s.shownLines.includes(intro)) intro = `${intro} (${n + 1})`;
    rememberLine(s, intro);
    if (!candidates.length) {
      return { kind: "followup", payload: { archetype: a, intro, verse: null, step, closing: "We have read every verse I keep for this. Breathe with me for a minute, or write in your journal what you want to keep." } };
    }
    const verse = candidates[0].v;
    markVerse(s, verse.reference);
    return { kind: "followup", payload: { archetype: a, intro, verse, step, closing: FOLLOW_CLOSINGS[n % FOLLOW_CLOSINGS.length] } };
  }

  function clarify(s, text, lib) {
    const { ranked } = matchArchetype(text, lib.archetypes);
    const fresh = ranked.filter(r => !s.offered.includes(r.archetype.id));
    const pool = (fresh.length >= 4 ? fresh : ranked);
    const options = pool.slice(0, 4).map(r => ({ id: r.archetype.id, title: r.archetype.title }));
    options.forEach(o => s.offered.push(o.id));
    let prompt = pickUnused(s, CLARIFY_PROMPTS) || CLARIFY_PROMPTS[s.clarifies % CLARIFY_PROMPTS.length];
    s.clarifies++;
    rememberLine(s, prompt);
    return { kind: "clarify", payload: { prompt, options } };
  }

  function close(s) {
    s.phase = 0;
    const message = rememberLine(s, pickUnused(s, CLOSE_LINES) || CLOSE_LINES[0]);
    return { kind: "close", payload: { message, offers: ["breathe", "journal"] } };
  }

  // ---- Asides ------------------------------------------------------------
  // Requests and small talk are not feelings. They get a plain line, no verse, and the
  // session is left exactly as it was. A request wins over a stray keyword match
  // ("dark mode", "how does this work") unless the person says how they feel ("I feel...").
  const FEELING_OPENER = /\b(i feel|i am|im|i have|ive|i keep|i cant|feeling)\b/;
  const ASIDES = [
    { re: /\b(change|update|set|rename)\b.*\b(my )?name\b|\brename (me|myself)\b/, action: "open-settings",
      message: "You can change your name in Settings, under Account. Whenever you want to go on, tell me what is on your mind." },
    { re: /\b(sign|log) ?(me )?(out|off)\b|\blogout\b/,
      message: "Sign out is in the footer of your Practice page. I am here when you come back." },
    { re: /\bdelete (my )?(account|data)\b/, action: "open-settings",
      message: "You can delete your account in Settings, under Account." },
    { re: /\b(change|reset|update) (my )?password\b/, action: "open-settings",
      message: "You can change your password in Settings, under Account." },
    { re: /\b(export|download) (my )?(data|journal)\b/, action: "open-settings",
      message: "You can download your data in Settings, under Account." },
    { re: /\b(dark|light|white|night) (mode|theme)\b/,
      message: "The Light and Dark link in the top bar switches the page." },
    { re: /\b(volume|music|sound|mute|unmute)\b/,
      message: "The volume button in the top bar turns the sound on or off and sets how loud it is." },
    { re: /^(hi|hello|hey|hi there|hello there|thanks|thank you|thanks a lot|thank you so much|ok|okay)$/,
      message: "I am glad you are here. Tell me what is on your mind, when you are ready." },
    { re: /^(what is this|what is this app|how does this work|how do you work|who are you|what are you|what can you do|help)$/,
      message: "I am Krishna here: I ask you two questions about what you are carrying, then offer one verse and one short practice. If you are in danger, helplines are under Safe Harbor." },
  ];
  function detectAside(text, lib) {
    const t = String(text || "").toLowerCase().replace(/[’']/g, "").trim().replace(/[.!?\s]+$/, "");
    if (!t) return null;
    const hit = ASIDES.find(a => a.re.test(t));
    if (!hit) return null;
    const felt = matchArchetype(t, lib.archetypes).archetype;
    if (felt && FEELING_OPENER.test(t)) return null;
    const out = { kind: "aside", payload: { message: hit.message } };
    if (hit.action) out.action = hit.action;
    return out;
  }

  // input: { text } | { reaction: "calm"|"ask" } | { archetypeId }
  function nextTurn(s, input, lib) {
    input = input || {};
    const text = input.text || "";
    if (text && detectCrisis(text)) { return { kind: "crisis", payload: { text } }; }

    if (text && !input.archetypeId && !input.reaction) {
      const aside = detectAside(text, lib);
      if (aside) return aside;
    }

    const current = s.archetypeId ? byId(lib, s.archetypeId) : null;

    if (input.archetypeId) {
      const a = byId(lib, input.archetypeId);
      if (a) return startPhase1(s, a, lib);
    }
    if (input.reaction === "calm") return close(s);
    if (input.reaction === "ask") return current ? followup(s, current, "", lib, s.lastAnswer) : clarify(s, "", lib);

    if (s.phase === 1 && current) return phase2(s, current, text, lib);

    const m = matchArchetype(text, lib.archetypes);
    if (s.phase >= 2 && current) {
      if (m.archetype && m.archetype.id !== current.id) {
        const t = startPhase1(s, m.archetype, lib); t.switched = true; return t;
      }
      return followup(s, current, text, lib);
    }
    if (m.archetype) return startPhase1(s, m.archetype, lib);
    return clarify(s, text, lib);
  }

  const api = { createSession, nextTurn, detectCrisis, detectAside, matchArchetype, verseKey, verseParts };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Dialogue = api;
})(typeof window !== "undefined" ? window : globalThis);
