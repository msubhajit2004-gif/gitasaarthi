// Tests for the conversation engine (js/dialogue.js). Run: node --test tests/
const test = require("node:test");
const assert = require("node:assert/strict");
const { WISDOM_ARCHETYPES, DAILY_SHLOKAS } = require("../js/curated_wisdom.js");
const D = require("../js/dialogue.js");

const lib = { archetypes: WISDOM_ARCHETYPES, dailyShlokas: DAILY_SHLOKAS };
const verseKey = (p) => p.verse && D.verseKey(p.verse.reference);

function toPhase2(text = "I feel burnt out and overworked") {
  const s = D.createSession();
  const t1 = D.nextTurn(s, { text }, lib);
  assert.equal(t1.kind, "phase1");
  const t2 = D.nextTurn(s, { text: t1.payload.quickPills[0] }, lib);
  assert.equal(t2.kind, "phase2");
  return { s, t1, t2 };
}

test("Ask more after phase 2 gives a follow-up with a new verse each time", () => {
  const { s, t2 } = toPhase2();
  const seen = new Set([D.verseKey(t2.payload.shloka.reference)]);
  for (let i = 0; i < 3; i++) {
    const t = D.nextTurn(s, { reaction: "ask" }, lib);
    assert.equal(t.kind, "followup");
    const k = verseKey(t.payload);
    assert.ok(k, "follow-up carries a verse");
    assert.ok(!seen.has(k), `verse ${k} was already shown`);
    seen.add(k);
  }
});

test("I feel calmer closes the conversation instead of restarting phase 1", () => {
  const { s } = toPhase2();
  const t = D.nextTurn(s, { reaction: "calm" }, lib);
  assert.equal(t.kind, "close");
});

test("Unmatched input asks which feeling is closest, never the same fallback twice", () => {
  const s = D.createSession();
  const a = D.nextTurn(s, { text: "hmm" }, lib);
  const b = D.nextTurn(s, { text: "hmm" }, lib);
  assert.equal(a.kind, "clarify");
  assert.equal(b.kind, "clarify");
  assert.equal(a.payload.options.length, 4);
  assert.notEqual(a.payload.prompt + a.payload.options.map(o => o.id).join(), b.payload.prompt + b.payload.options.map(o => o.id).join());
});

test("Word stems match: 'overwhelming pressure at work' finds burnout or workplace", () => {
  const m = D.matchArchetype("I feel overwhelming pressure at work", WISDOM_ARCHETYPES);
  assert.ok(m.archetype, "a feeling matched");
  assert.ok(["burnout", "workplace"].includes(m.archetype.id), `matched ${m.archetype.id}`);
});

test("A different feeling after phase 2 switches to that feeling", () => {
  const { s } = toPhase2();
  const t = D.nextTurn(s, { text: "my heart is broken after the breakup" }, lib);
  assert.equal(t.kind, "phase1");
  assert.equal(t.switched, true);
  assert.equal(t.payload.archetype.id, "heartbreak");
});

test("Crisis language is caught at every phase", () => {
  const phrases = ["I want to kill myself", "i don't want to live anymore", "thinking about suicide", "I have been self-harming", "I want to end my life"];
  for (const p of phrases) {
    assert.equal(D.nextTurn(D.createSession(), { text: p }, lib).kind, "crisis", p);
    const { s } = toPhase2();
    assert.equal(D.nextTurn(s, { text: p }, lib).kind, "crisis", p + " (after phase 2)");
  }
  assert.equal(D.detectCrisis("I want to end my day with a walk"), false);
});

test("Phase 2 names the user's own answer", () => {
  const s = D.createSession();
  D.nextTurn(s, { text: "I am exhausted from work" }, lib);
  const t = D.nextTurn(s, { text: "My manager keeps adding deadlines" }, lib);
  assert.equal(t.kind, "phase2");
  assert.match(t.payload.echo, /My manager keeps adding deadlines/);
});

test("No opening line repeats across a 10-turn conversation", () => {
  const s = D.createSession();
  const turns = [
    { archetypeId: "burnout" }, { text: "Fear that stopping means falling behind" },
    { reaction: "ask" }, { reaction: "ask" }, { text: "it is still heavy" },
    { text: "hmm" }, { text: "hmm" }, { archetypeId: "burnout" },
    { text: "deadlines again" }, { reaction: "calm" },
  ];
  const lines = [];
  for (const input of turns) {
    const t = D.nextTurn(s, input, lib);
    const line = t.payload.acknowledgment || t.payload.intro || t.payload.prompt || t.payload.message || t.payload.synthesis;
    assert.ok(line, `turn ${t.kind} has an opening line`);
    assert.ok(!lines.includes(line), `repeated line on ${t.kind}: ${line}`);
    lines.push(line);
  }
});

test("Ask more does not keep quoting the same answer back", () => {
  const { s } = toPhase2();
  const a = D.nextTurn(s, { reaction: "ask" }, lib);
  const b = D.nextTurn(s, { reaction: "ask" }, lib);
  assert.ok(!/“/.test(a.payload.intro), a.payload.intro);
  assert.notEqual(a.payload.intro, b.payload.intro);
});

test("Negated keywords keep their meaning: 'comparing myself to my friends' is envy, not loneliness", () => {
  assert.equal(D.matchArchetype("I also keep comparing myself to my friends", WISDOM_ARCHETYPES).archetype.id, "jealousy");
  assert.equal(D.matchArchetype("I have no friends at all", WISDOM_ARCHETYPES).archetype.id, "loneliness");
});

// ---- Asides: requests and small talk are not feelings -------------------------
const snap = (s) => JSON.stringify(s);

test("A rename request is an aside with no verse, and it points to Settings", () => {
  for (const text of ["change my name to subha", "Please update my name", "rename me", "set my name to Ravi"]) {
    const t = D.nextTurn(D.createSession(), { text }, lib);
    assert.equal(t.kind, "aside", text);
    assert.equal(t.action, "open-settings", text);
    assert.match(t.payload.message, /Settings, under Account/);
    assert.equal(t.payload.verse, undefined);
  }
});

test("An aside mid-conversation leaves the session untouched", () => {
  const { s } = toPhase2();
  const before = snap(s);
  const t = D.nextTurn(s, { text: "change my name to subha" }, lib);
  assert.equal(t.kind, "aside");
  assert.equal(snap(s), before);
  assert.equal(D.nextTurn(s, { reaction: "ask" }, lib).kind, "followup");
  const p1 = D.createSession();
  D.nextTurn(p1, { text: "I feel burnt out and overworked" }, lib);
  const b1 = snap(p1);
  assert.equal(D.nextTurn(p1, { text: "rename my name" }, lib).kind, "aside");
  assert.equal(snap(p1), b1);
});

test("A feeling plus a request goes to the normal flow", () => {
  const t = D.nextTurn(D.createSession(), { text: "I feel anxious and want to change my name" }, lib);
  assert.notEqual(t.kind, "aside");
});

test("Crisis text still wins over an aside pattern", () => {
  assert.equal(D.nextTurn(D.createSession(), { text: "I want to die, change my name" }, lib).kind, "crisis");
  assert.equal(D.nextTurn(D.createSession(), { text: "log out, I want to kill myself" }, lib).kind, "crisis");
});

test("Account and app requests get a one-line pointer", () => {
  const cases = {
    "sign out": /footer/i, "log me out": /footer/i, "delete my account": /Settings/,
    "change my password": /Settings/, "download my data": /Settings/, "export my data": /Settings/,
    "switch to dark mode": /Light|Dark/i, "turn the music off": /volume|sound/i, "volume": /volume|sound/i,
  };
  for (const [text, re] of Object.entries(cases)) {
    const t = D.nextTurn(D.createSession(), { text }, lib);
    assert.equal(t.kind, "aside", text);
    assert.match(t.payload.message, re, text);
    assert.equal(t.payload.verse, undefined);
  }
  assert.equal(D.nextTurn(D.createSession(), { text: "delete my account" }, lib).action, "open-settings");
});

test("Greetings and thanks alone give a short line and no verse", () => {
  for (const text of ["hello", "Hi", "hey!", "thanks", "thank you", "ok", "okay."]) {
    const s = D.createSession();
    const t = D.nextTurn(s, { text }, lib);
    assert.equal(t.kind, "aside", text);
    assert.equal(t.payload.verse, undefined);
    assert.equal(s.phase, 0);
  }
});

test("Questions about the app are answered in two plain sentences", () => {
  for (const text of ["what is this", "How does this work?", "who are you", "help"]) {
    const t = D.nextTurn(D.createSession(), { text }, lib);
    assert.equal(t.kind, "aside", text);
    assert.match(t.payload.message, /two questions/);
    assert.match(t.payload.message, /Safe Harbor/);
  }
});

test("Ordinary feelings and unmatched text are not asides", () => {
  assert.equal(D.nextTurn(D.createSession(), { text: "I feel burnt out" }, lib).kind, "phase1");
  assert.equal(D.nextTurn(D.createSession(), { text: "hmm" }, lib).kind, "clarify");
});


// "What's my name?" is a question the app can answer from the account, not a feeling to counsel.
test("asking for your own name is answered from the account, not counselled", () => {
  for (const q of ["whats my name?", "what's my name", "What is my name?", "do you know my name?", "what do you call me"]) {
    const t = D.nextTurn(D.createSession(), { text: q }, lib);
    assert.equal(t.kind, "aside", q);
    assert.equal(t.action, "say-name", q);
    assert.match(t.payload.message, /\{name\}/, q);
  }
});

test("statements and feelings that merely contain the word name are not intercepted", () => {
  for (const q of ["my name is Asha", "I feel lost and I do not know who I am", "I hate my name and feel worthless", "who am I?"]) {
    const t = D.nextTurn(D.createSession(), { text: q }, lib);
    assert.notEqual(t.action, "say-name", q);
  }
});
