// Tests for Gita answers (js/gita_knowledge.js). Run: node --test tests/
const test = require("node:test");
const assert = require("node:assert/strict");
const { WISDOM_ARCHETYPES, DAILY_SHLOKAS } = require("../js/curated_wisdom.js");
const G = require("../js/gita_knowledge.js");
const D = require("../js/dialogue.js");

const lib = { archetypes: WISDOM_ARCHETYPES, dailyShlokas: DAILY_SHLOKAS };
const sentences = (m) => (m.match(/[^.!?]+[.!?]+/g) || [m]).length;

// Every "chapter.verse" the library really holds (ranges expanded).
function libraryRefs() {
  const out = new Set();
  const add = (s) => {
    for (const m of String(s).matchAll(/(\d+)\.(\d+)(?:[-–](\d+))?/g)) for (let v = +m[2]; v <= +(m[3] || m[2]); v++) out.add(m[1] + "." + v);
    const c = String(s).match(/Chapter\s+(\d+),\s*Verse\s+(\d+)(?:[-–](\d+))?/i);
    if (c) for (let v = +c[2]; v <= +(c[3] || c[2]); v++) out.add(c[1] + "." + v);
  };
  for (const a of WISDOM_ARCHETYPES) add(a.phase2.shloka.reference);
  for (const d of DAILY_SHLOKAS) add(d.chapterVerse);
  return out;
}
const cited = (text) => {
  const out = [];
  for (const m of String(text).matchAll(/(?:Bhagavad Gita|BG)\s*(\d+)\.(\d+)(?:[-–](\d+))?(?:\s*&\s*(\d+)\.(\d+))?/g)) {
    out.push(m[1] + "." + m[2]); if (m[4]) out.push(m[4] + "." + m[5]);
  }
  return out;
};

test("findVerse understands the usual spellings", () => {
  for (const ref of ["2.47", "chapter 2 verse 47", "BG 2.47", "Bhagavad Gita 2.47", "Chapter 2, Verse 47", "gita 2:47"]) {
    const v = G.findVerse(ref, lib);
    assert.ok(v, ref);
    assert.match(v.reference, /2\.47/);
    assert.ok(v.sanskrit && v.translation);
  }
  assert.equal(G.findVerse("2.46", lib), null);
  assert.equal(G.findVerse("nonsense", lib), null);
  assert.match(G.findVerse("18.66", lib).reference, /^Bhagavad Gita 18\.66$/);
  assert.ok(G.findVerse("9.31", lib), "a verse inside a range the library holds");
});

test("karma, dharma, atman, yoga, bhakti, detachment, surrender cite the fitting library verse", () => {
  const want = { "what is karma": "2.47", "what is dharma": "3.35", "what is atman": "2.20", "what is yoga": "2.48",
    "what is bhakti": "9.26", "what is detachment": "2.48", "what does surrender mean": "18.66" };
  for (const [q, ref] of Object.entries(want)) {
    const a = G.answer(q, lib, D.createSession());
    assert.ok(a, q);
    assert.deepEqual(Object.keys(a).sort(), ["message", "verse"]);
    assert.deepEqual(cited(a.verse.reference), [ref], q);
    assert.ok(a.verse.sanskrit && a.verse.translation);
    assert.ok(sentences(a.message) <= 3, q);
  }
});

test("who is Krishna and what is the Gita are answered with no verse", () => {
  const k = G.answer("who is Krishna", lib, D.createSession());
  assert.match(k.message, /charioteer/i);
  assert.equal(k.verse, null);
  const g = G.answer("what is the Bhagavad Gita", lib, D.createSession());
  assert.match(g.message, /18 chapters/);
  assert.match(g.message, /700/);
  assert.match(g.message, /Arjuna/);
  assert.match(g.message, /Kurukshetra/);
  assert.equal(g.verse, null);
  assert.match(G.answer("how many chapters are in the gita", lib, D.createSession()).message, /18 chapters/);
});

test("explain chapter 2 verse 47 gives that verse; a verse the library lacks is said plainly", () => {
  const a = G.answer("explain chapter 2 verse 47", lib, D.createSession());
  assert.match(a.verse.reference, /2\.47/);
  assert.ok(a.message.length > 20);
  const miss = G.answer("explain chapter 3 verse 21", lib, D.createSession());
  assert.match(miss.message, /not in the library|do not have/i);
  assert.ok(miss.verse, "offers the nearest verse it has");
  assert.ok(libraryRefs().has(cited(miss.verse.reference)[0]), "the offered verse exists");
  assert.ok(!/3\.21|Verse 21/.test(miss.message), "the missing reference is not repeated as a citation");
  assert.match(G.answer("what does chapter 40 verse 1 say", lib, D.createSession()).message, /18 chapters/);
});

test("Review focus 2: 'what does that verse mean?' explains the verse just shown", () => {
  const s = D.createSession();
  D.nextTurn(s, { text: "I am so burnt out from work" }, lib);
  const p2 = D.nextTurn(s, { text: "too many deadlines" }, lib);
  assert.equal(p2.kind, "phase2");
  for (const q of ["what does that verse mean?", "tell me more", "explain it simply"]) {
    const t = D.nextTurn(s, { text: q }, lib);
    assert.equal(t.kind, "answer", q);
    assert.deepEqual(cited(t.payload.verse.reference), ["2.47"], q);
    assert.ok(t.payload.message.length > 40);
    assert.ok(!/pranama/i.test(t.payload.message));
  }
  assert.equal(s.archetypeId, "burnout", "the conversation did not move on");
});

test("The explanation uses the library's own commentary", () => {
  const s = D.createSession();
  D.nextTurn(s, { text: "I feel anxious all the time" }, lib);
  D.nextTurn(s, { text: "mostly at night" }, lib);
  const t = D.nextTurn(s, { text: "what does that verse mean?" }, lib);
  const insight = WISDOM_ARCHETYPES.find(a => a.id === "anxiety").phase2.shloka.insight;
  assert.ok(t.payload.message.includes(insight.slice(0, 40)));
});

test("A doubt about the verse stays with the verse", () => {
  const s = D.createSession();
  D.nextTurn(s, { text: "I am terrified of failing my exam" }, lib);
  D.nextTurn(s, { text: "my parents expect a lot" }, lib);
  const t = D.nextTurn(s, { text: "but what if I still fail?" }, lib);
  assert.equal(t.kind, "answer");
  assert.deepEqual(cited(t.payload.verse.reference).sort(), ["2.38", "2.48"]);
});

test("What does the Gita say about a feeling points to that feeling's verse", () => {
  const a = G.answer("what does the gita say about anger", lib, D.createSession());
  assert.ok(a && a.verse);
  assert.match(a.verse.reference, /2\.62/);
});

test("Unknown topics return null so the engine can fall back", () => {
  assert.equal(G.answer("what is the best pizza", lib, D.createSession()), null);
  assert.equal(G.answer("", lib, D.createSession()), null);
});

test("Property: no glossary answer cites a reference the library does not hold, and none says Pranama", () => {
  const refs = libraryRefs();
  assert.ok(G.GLOSSARY.length >= 18);
  for (const e of G.GLOSSARY) {
    const a = G.answer(e.ask, lib, D.createSession());
    assert.ok(a, e.id + " answers its own question: " + e.ask);
    assert.ok(sentences(a.message) <= 3, e.id + " has at most 3 sentences");
    assert.ok(!/pranama/i.test(a.message), e.id);
    assert.ok(!/\b\d{1,2}\.\d{1,3}\b/.test(a.message), e.id + " does not hide a reference in prose");
    if (e.verse) {
      assert.ok(a.verse === null || a.verse && cited(a.verse.reference).every(r => refs.has(r)), e.id);
    }
    if (a.verse) for (const r of cited(a.verse.reference)) assert.ok(refs.has(r), `${e.id} cites ${r}`);
  }
  // an empty library cites nothing
  const bare = G.answer("what is karma", { archetypes: [], dailyShlokas: [] }, D.createSession());
  assert.equal(bare.verse, null);
});

test("Gita questions reach GitaKnowledge through nextTurn as 'answer'", () => {
  for (const q of ["what is karma", "who is Krishna", "what is the Bhagavad Gita", "explain chapter 2 verse 47", "what does surrender mean"]) {
    const t = D.nextTurn(D.createSession(), { text: q }, lib);
    assert.equal(t.kind, "answer", q);
    assert.ok(!/pranama/i.test(t.payload.message), q);
  }
});
