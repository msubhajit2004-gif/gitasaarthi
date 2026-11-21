// ============================================================================
// GitaSaarthi Gita answers (offline, deterministic). Short factual glossary entries
// plus verse lookup over the curated library only: a verse is attached when its
// reference exists in curated_wisdom.js, never otherwise. Glossary text is plain
// explanation written for this app; it quotes no scripture.
// Browser: window.GitaKnowledge. Node: module.exports.
// ============================================================================
(function (root) {
  "use strict";

  function safeRequire(p) { try { return require(p); } catch (e) { return null; } }
  const U = () => (typeof module !== "undefined" && module.exports) ? safeRequire("./understand.js") : root.Understand;

  // ---- Library verses ----------------------------------------------------------------
  // "Bhagavad Gita 6.26 & 6.19" -> [{ch:6,a:26,b:26},{ch:6,a:19,b:19}]; "Chapter 6, Verse 16-17" -> [{ch:6,a:16,b:17}]
  function rangesOf(ref) {
    const s = String(ref || "");
    const c = s.match(/Chapter\s+(\d+),?\s*Verse\s+(\d+)(?:\s*[-–]\s*(\d+))?/i);
    if (c) return [{ ch: +c[1], a: +c[2], b: +(c[3] || c[2]) }];
    const out = [];
    for (const m of s.matchAll(/(\d+)\.(\d+)(?:\s*[-–]\s*(\d+))?/g)) out.push({ ch: +m[1], a: +m[2], b: +(m[3] || m[2]) });
    return out;
  }
  function entries(lib) {
    const out = [];
    for (const a of (lib && lib.archetypes) || []) {
      const sh = a.phase2 && a.phase2.shloka;
      if (sh && rangesOf(sh.reference).length) out.push({ reference: sh.reference, sanskrit: sh.sanskrit, translation: sh.translation, insight: sh.insight || "", ranges: rangesOf(sh.reference), owner: a.id });
    }
    for (const d of (lib && lib.dailyShlokas) || []) {
      const r = rangesOf(d.chapterVerse);
      if (r.length) out.push({ reference: "Bhagavad Gita " + r.map(x => x.ch + "." + x.a + (x.b !== x.a ? "-" + x.b : "")).join(" & "),
        sanskrit: d.sanskrit, translation: d.translation, insight: d.meditation || "", ranges: r, owner: null });
    }
    return out;
  }
  const publicVerse = (e) => e ? { reference: e.reference, sanskrit: e.sanskrit, translation: e.translation } : null;

  // What reference does the text ask about? { ch, v, v2 } or { ch } (chapter only) or null.
  function parseRef(text) {
    const t = String(text || "").toLowerCase();
    let m = t.match(/chapter\s*(\d{1,2})\W+(?:verse|shloka|sloka|v)\s*(\d{1,3})(?:\s*[-–]\s*(\d{1,3}))?/)
      || t.match(/\b(?:ch|adhyay|adhyaya)\.?\s*(\d{1,2})\W+(?:v|verse)\.?\s*(\d{1,3})(?:\s*[-–]\s*(\d{1,3}))?/);
    if (m) return { ch: +m[1], v: +m[2], v2: +(m[3] || m[2]) };
    m = t.match(/(?:verse|shloka|sloka)\s*(\d{1,3})\s*(?:of|in|from)\s*chapter\s*(\d{1,2})/);
    if (m) return { ch: +m[2], v: +m[1], v2: +m[1] };
    m = t.match(/(?:^|[^\d.])(\d{1,2})\s*[.:]\s*(\d{1,3})(?:\s*[-–]\s*(\d{1,3}))?(?!\d)/);
    if (m) return { ch: +m[1], v: +m[2], v2: +(m[3] || m[2]) };
    m = t.match(/chapter\s*(\d{1,2})\b/);
    return m ? { ch: +m[1] } : null;
  }

  function lookup(ref, lib) {
    const all = entries(lib);
    const hits = all.filter(e => e.ranges.some(r => r.ch === ref.ch && ref.v >= r.a && ref.v <= r.b));
    if (!hits.length) return null;
    const score = (e) => {
      const exact = e.ranges.some(r => r.ch === ref.ch && r.a === ref.v && r.b === ref.v2);
      return (exact ? 2 : 0) + (e.ranges.length === 1 ? 1 : 0);
    };
    return hits.map((e, i) => ({ e, i, s: score(e) })).sort((x, y) => y.s - x.s || x.i - y.i)[0].e;
  }
  function nearest(ref, lib) {
    let best = null, bestD = Infinity;
    for (const e of entries(lib)) for (const r of e.ranges) {
      if (r.ch !== ref.ch) continue;
      const d = ref.v < r.a ? r.a - ref.v : ref.v > r.b ? ref.v - r.b : 0;
      if (d < bestD) { best = e; bestD = d; }
    }
    return best;
  }
  function findVerse(refText, lib) {
    const ref = parseRef(refText);
    if (!ref || ref.v == null) return null;
    const e = lookup(ref, lib);
    return e ? { reference: e.reference, sanskrit: e.sanskrit, translation: e.translation, insight: e.insight } : null;
  }

  // ---- Glossary ---------------------------------------------------------------------
  // id, ask (a question that must reach this entry), re (matched on normalized text),
  // verse (a library reference worth attaching, if the library holds it).
  const GLOSSARY = [
    { id: "karma", ask: "what is karma", re: /\bkarma\b/, verse: "2.47",
      text: "Karma means action, and also the results that follow from action. In the Gita, Krishna teaches karma yoga: do your duty with full effort and let go of the claim on the outcome. That is not a call to stop caring, only to stop being ruled by the result." },
    { id: "dharma", ask: "what is dharma", re: /\bdharma\b/, verse: "3.35",
      text: "Dharma is the duty or right way of living that belongs to a person and their place in life. The Gita says it is better to follow your own dharma imperfectly than another person's perfectly. Arjuna's question on the battlefield is, at heart, a question about his dharma." },
    { id: "atman", ask: "what is atman", re: /\b(atman|atma|soul|the self|true self)\b/, verse: "2.20",
      text: "The atman is the true self, the eternal witness within. In the Gita, Krishna says it is never born and never dies, even when the body does. Knowing this is meant to steady a person against loss and fear." },
    { id: "yoga", ask: "what is yoga", re: /\byoga\b/, verse: "2.48",
      text: "Yoga means union and discipline. In the Gita it is a steady mind that stays even in success and failure, practised through action, knowledge and devotion. It is more than posture: Krishna calls equanimity itself yoga." },
    { id: "bhakti", ask: "what is bhakti", re: /\bbhakti\b|\bdevotion\b/, verse: "9.26",
      text: "Bhakti is loving devotion to the divine. In the Gita it is one of the paths to freedom: offering your actions and your heart to Krishna. Krishna says even a simple offering made with love is accepted." },
    { id: "jnana", ask: "what is jnana", re: /\b(jnana|gyan|gyaan|jnana yoga)\b/, verse: "4.38",
      text: "Jnana is knowledge, above all knowledge of the self. The Gita names it as one of the paths, beside action and devotion. Krishna says nothing purifies like this knowledge." },
    { id: "moksha", ask: "what is moksha", re: /\b(moksha|moksh|liberation)\b/, verse: null,
      text: "Moksha is liberation: freedom from the cycle of birth and death, and from being bound by desire and fear. The Gita describes a freedom reached through steady action without clinging, through knowledge and through devotion. Many readers also take it as an inner freedom that can be found while living." },
    { id: "maya", ask: "what is maya", re: /\bmaya\b/, verse: null,
      text: "Maya is the power by which the world appears real, separate and ever changing, so that we forget our deeper nature. In the Gita, Krishna calls his maya divine and hard to cross, and says those who turn to him cross it. It is often translated as illusion, though that does not mean the world does not exist." },
    { id: "gunas", ask: "what are the three gunas", re: /\b(gunas?|sattva|rajas|tamas)\b/, verse: "14.22-25",
      text: "The three gunas are the qualities of nature: sattva (clarity and calm), rajas (restless activity and craving) and tamas (inertia and dullness). The Gita says every person is moved by some mix of them. Krishna teaches rising above all three." },
    { id: "arjuna", ask: "who is arjuna", re: /\barjuna\b/, verse: "18.73",
      text: "Arjuna is the Pandava warrior to whom Krishna speaks the Gita. On the battlefield of Kurukshetra he loses heart and puts down his bow, and the teaching begins from his confusion. At the end he says his doubt is gone and he is ready to act." },
    { id: "kurukshetra", ask: "what is kurukshetra", re: /\bkurukshetra\b/, verse: null,
      text: "Kurukshetra is the battlefield in the Mahabharata where the armies of the Pandavas and the Kauravas meet. The Gita opens there, just before the battle begins. Many readers take it as a picture of the struggle inside a person." },
    { id: "mahabharata", ask: "what is the mahabharata", re: /\bmahabharata\b/, verse: null,
      text: "The Mahabharata is a very long Sanskrit epic about a war between two branches of one family, the Pandavas and the Kauravas. The Bhagavad Gita is one part of it. It is the conversation just before the great battle." },
    { id: "detachment", ask: "what is detachment", re: /\b(detachment|non attachment|nonattachment|nishkama|vairagya|detached)\b/, verse: "2.48",
      text: "Detachment means doing your work wholeheartedly without being ruled by its results. It does not mean not caring. The Gita calls this acting without clinging to the fruit of action." },
    { id: "surrender", ask: "what does surrender mean", re: /\b(surrender|sharanagati|sharanagat|take refuge)\b/, verse: "18.66",
      text: "Surrender, or sharanagati, means laying down the burden of control and trusting the divine with what is beyond your effort. It is not giving up or doing nothing. In the Gita, Krishna's last teaching asks Arjuna to take refuge in him alone." },
    { id: "equanimity", ask: "what is equanimity", re: /\bequanimity\b|\bsthitaprajna\b/, verse: "2.48",
      text: "Equanimity is staying even-minded in pleasure and pain, in success and failure. In the Gita, Krishna says this evenness is what yoga means. It is a calm that does not depend on how things turn out." },
    { id: "ego", ask: "what is ego in the gita", re: /\b(ego|ahamkara|ahankar)\b/, verse: "3.27",
      text: "Ego, in the Gita, is the sense of being the doer: the belief that I alone produce my actions and own their results. Krishna says a mind deluded by ego thinks this, while the actions are really carried out by the workings of nature. Seeing this loosens pride and the weight of blame." },
    { id: "desire", ask: "what is desire in the gita", re: /\b(desire|desires|kama|craving)\b/, verse: "2.62-63",
      text: "Desire, in the Gita, is craving for what the senses seek. Krishna says dwelling on sense objects breeds attachment, then desire, then anger, and from anger confusion. The teaching is not to have no wants, but not to be driven by them." },
    { id: "krishna", ask: "who is krishna", re: /\bkrishna\b|\bkrsna\b|\bkrisna\b/, verse: null, generic: true,
      text: "Krishna is the charioteer and teacher of Arjuna in the Mahabharata, and in the Bhagavad Gita he speaks as the divine guide. He counsels Arjuna on duty, devotion and inner steadiness. Here I answer in his voice as a guide, not as the god himself." },
    { id: "gita", ask: "what is the bhagavad gita", re: /\b(gita|geeta)\b|\bbhagavad\b|\bbhagwad\b/, verse: null, generic: true,
      text: "The Bhagavad Gita is a scripture of 18 chapters and about 700 verses, part of the Mahabharata. It is a conversation between Arjuna and Krishna on the battlefield of Kurukshetra, about duty, the self, devotion and freedom. People read it for guidance on how to act well when the way is unclear." },
  ];

  // ---- Answering ---------------------------------------------------------------------
  const norm = (text) => String(text || "").toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9.:\-–]+/g, " ").trim();
  const VERSE_REF_Q = /\b(what|which) (does|do|did) (that|this|the) (verse|shloka|sloka|line|teaching|passage|one)\b|\bexplain (that|this|the|it)\b|\bwhat does (that|this|it) mean\b|\btell me more\b|\bmore about (that|this|it)\b|\bwhat do you mean\b|\bmeaning of (that|this)\b|\bwhy (this|that) verse\b|\bhow (does|do) (that|this|it) (help|apply|relate)\b|\bwhat is the meaning\b|\bcan you (explain|elaborate|clarify)\b|\belaborate\b|\bsay (that|it) (again|simply)\b|\bin simple (words|terms)\b|\bi dont (understand|get) (that|this|it)\b|\bwho said (that|this)\b|\bsimply\b/;
  const DOUBT_Q = /^(but |and )?(what if|how can|will it|will this|is it|does it|but)\b/;
  const SAY_ABOUT = /\b(gita|geeta|krishna|bhagavad gita)\s+(say|says|said|teach|teaches|tell|tells|advise|advises|think|suggest|suggests)\s*(me )?(about|on|regarding|for|when|if)?\s*(.*)$/;
  const GIVE_VERSE = /\b(give|show|tell|share|recite|read|send)\b.*\b(verse|shloka|sloka)\b/;

  function message(text, verse) { return { message: text, verse: publicVerse(verse) }; }

  function explainRef(ref, lib) {
    if (ref.v == null) {
      if (ref.ch < 1 || ref.ch > 18) return message("The Gita has 18 chapters, so there is no chapter " + ref.ch + ".", null);
      const e = entries(lib).find(x => x.ranges.some(r => r.ch === ref.ch));
      return e ? message("I keep a selection of verses, not whole chapters. This is one I have from that chapter. " + e.insight, e)
        : message("I do not have a verse from that chapter in my library.", null);
    }
    if (ref.ch < 1 || ref.ch > 18) return message("The Gita has 18 chapters, so that reference is not one I can find.", null);
    const e = lookup(ref, lib);
    if (e) return message("This is the verse you asked about, with the commentary I keep for it. " + e.insight, e);
    const n = nearest(ref, lib);
    return n ? message("I do not have that verse in the library I keep. The nearest one I do have is below. " + n.insight, n)
      : message("I do not have that verse in the library I keep, or any verse from that chapter.", null);
  }

  function explainLast(session, text) {
    const v = session.lastVerse;
    const n = session.explained = (session.explained || 0) + 1;
    const t = norm(text);
    let msg;
    if (DOUBT_Q.test(t) && !VERSE_REF_Q.test(t)) msg = "It is natural to doubt. The verse still stands for exactly this moment. " + (v.insight || "") + " Which part of it is hardest to trust?";
    else if (n > 1) msg = "Read it slowly once more, and notice the line that stays with you. " + (v.insight || "") + " What does that line say to your situation?";
    else msg = (v.insight ? v.insight + " " : "") + "Which part of it feels closest to your situation?";
    return message(msg.trim(), v);
  }

  function glossaryAnswer(entry, lib) {
    let verse = null;
    if (entry.verse) {
      const ref = parseRef(entry.verse.replace("-", "-"));
      const e = ref && lookup({ ch: ref.ch, v: ref.v, v2: ref.v2 }, lib);
      if (e) verse = e;
    }
    return message(entry.text, verse);
  }

  function feelingTopic(topic, lib) {
    const u = U();
    if (!u || !topic || !lib || !lib.archetypes || !lib.archetypes.length) return null;
    const top = u.rank(topic, u.buildIndex(lib.archetypes))[0];
    if (!top || top.score < u.MIN_SCORE) return null;
    const a = lib.archetypes.find(x => x.id === top.id);
    const sh = a && a.phase2 && a.phase2.shloka;
    if (!sh) return null;
    return message("The Gita speaks to this in several places. This is the verse I keep for it. " + (sh.insight || ""), { reference: sh.reference, sanskrit: sh.sanskrit, translation: sh.translation });
  }

  function answer(text, lib, session) {
    const t = norm(text);
    if (!t) return null;
    const s = session || {};
    lib = lib || { archetypes: [], dailyShlokas: [] };

    const ref = parseRef(text);
    if (ref) return explainRef(ref, lib);

    const specific = GLOSSARY.find(e => !e.generic && e.re.test(t));
    if (specific) return glossaryAnswer(specific, lib);

    if (s.lastVerse && (VERSE_REF_Q.test(t) || DOUBT_Q.test(t))) return explainLast(s, text);

    const about = t.match(SAY_ABOUT);
    if (about && about[5]) {
      const f = feelingTopic(about[5], lib);
      if (f) return f;
    }
    if (GIVE_VERSE.test(t)) {
      const seen = s.shownParts || [];
      const pick = entries(lib).find(e => !e.ranges.some(r => seen.includes(r.ch + "." + r.a)));
      if (pick) {
        for (const r of pick.ranges) if (s.shownParts && !s.shownParts.includes(r.ch + "." + r.a)) s.shownParts.push(r.ch + "." + r.a);
        return message("Here is a verse from my library to sit with. " + pick.insight, pick);
      }
    }
    const generic = GLOSSARY.find(e => e.generic && e.re.test(t));
    return generic ? glossaryAnswer(generic, lib) : null;
  }

  const api = { answer, findVerse, GLOSSARY, parseRef };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.GitaKnowledge = api;
})(typeof window !== "undefined" ? window : globalThis);
