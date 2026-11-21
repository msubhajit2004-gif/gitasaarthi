// Tests for intent routing (js/understand.js intent + js/dialogue.js nextTurn). Run: node --test tests/
const test = require("node:test");
const assert = require("node:assert/strict");
const { WISDOM_ARCHETYPES, DAILY_SHLOKAS } = require("../js/curated_wisdom.js");
const U = require("../js/understand.js");
const D = require("../js/dialogue.js");

const lib = { archetypes: WISDOM_ARCHETYPES, dailyShlokas: DAILY_SHLOKAS };
const type = (text, session) => U.intent(text, session).type;
const turn = (text, s = D.createSession()) => D.nextTurn(s, { text }, lib);
function toPhase1(text = "I feel anxious all the time") {
  const s = D.createSession();
  assert.equal(D.nextTurn(s, { text }, lib).kind, "phase1");
  return s;
}
function toPhase2(text = "I feel burnt out and overworked") {
  const s = toPhase1(text);
  assert.equal(D.nextTurn(s, { text: "too many deadlines" }, lib).kind, "phase2");
  return s;
}

test("intent: one case per type", () => {
  assert.equal(type("I want to kill myself"), "crisis");
  assert.equal(type("change my password"), "aside");
  assert.equal(type("good morning"), "greeting");
  assert.equal(type("how are you"), "greeting");
  assert.equal(type("thank you krishna"), "gratitude");
  assert.equal(type("yes"), "affirm");
  assert.equal(type("a bit"), "affirm");
  assert.equal(type("no"), "deny");
  assert.equal(type("hmm"), "filler");
  assert.equal(type("I got the job today!"), "good_news");
  assert.equal(type("what is karma"), "gita_question");
  assert.equal(type("explain chapter 2 verse 47"), "gita_question");
  assert.equal(type("what does that verse mean?", { lastVerse: { reference: "x" }, phase: 2 }), "verse_question");
  assert.equal(type("tell me a joke"), "offtopic");
  assert.equal(type("whats 2+2"), "offtopic");
  assert.equal(type("cricket score"), "offtopic");
  assert.equal(type("I feel anxious about my exams"), "feeling");
  assert.equal(type("blorp"), "unclear");
});

test("Review focus 1: a feeling in question form stays a feeling", () => {
  for (const q of ["why do I always feel so alone?", "why am I so angry all the time?", "how do I stop worrying about the future?", "what should I do about my debt?"]) {
    assert.equal(type(q), "feeling", q);
  }
  const t = turn("why do I always feel so alone?");
  assert.equal(t.kind, "phase1");
  assert.equal(t.payload.archetype.id, "loneliness");
});

test("Review focus 3: a crisis term inside a question is crisis", () => {
  for (const q of ["what is the point of living", "What's the point of living?", "why should I even go on", "I wish I could just disappear", "no point in living anymore", "what is the point of life"]) {
    assert.equal(turn(q).kind, "crisis", q);
    assert.equal(turn(q, toPhase2()).kind, "crisis", q + " (after phase 2)");
  }
  assert.equal(D.detectCrisis("what is the point of this exam"), false);
  assert.equal(D.detectCrisis("I want to end my day with a walk"), false);
});

test("Review focus 4: a short reply to Krishna's question continues the conversation", () => {
  for (const reply of ["yes", "a bit", "no", "not really", "hmm", "maybe", "i dont know"]) {
    const s = toPhase1();
    const t = D.nextTurn(s, { text: reply }, lib);
    assert.equal(t.kind, "phase2", reply);
    assert.equal(t.payload.archetype.id, "anxiety", reply);
    assert.equal(s.phase, 2);
  }
});

test("Short replies with no conversation get a gentle prompt, never the picker", () => {
  for (const reply of ["yes", "no", "hmm", "a bit"]) {
    const s = D.createSession();
    const t = D.nextTurn(s, { text: reply }, lib);
    assert.equal(t.kind, "smalltalk", reply);
    assert.match(t.payload.message, /\?|tell me|take your time/i);
    assert.equal(s.phase, 0);
  }
});

test("Short replies after phase 2 stay in the conversation without a new verse", () => {
  for (const reply of ["yes", "no", "hmm"]) {
    const s = toPhase2();
    const t = D.nextTurn(s, { text: reply }, lib);
    assert.equal(t.kind, "smalltalk", reply);
    assert.equal(t.payload.verse, undefined);
    assert.equal(s.archetypeId, "burnout");
  }
});

test("Greetings and how-are-you get warm, varied lines without Pranama", () => {
  const seen = new Set();
  const s = D.createSession();
  for (const text of ["good morning", "how are you", "good evening", "how are you doing", "kaise ho"]) {
    const t = D.nextTurn(s, { text }, lib);
    assert.equal(t.kind, "smalltalk", text);
    assert.ok(!/pranama/i.test(t.payload.message));
    assert.equal(t.payload.verse, undefined);
    seen.add(t.payload.message);
  }
  assert.equal(seen.size, 5, "no two replies are the same");
  assert.equal(turn("good morning").payload.message, turn("good morning").payload.message, "deterministic for a fresh session");
  assert.match(turn("good morning").payload.message, /^Good morning/);
});

test("Thanks gets a short blessing and never repeats a verse", () => {
  const s = toPhase2();
  for (const text of ["thank you krishna", "thanks that helps", "thank you for listening"]) {
    const t = D.nextTurn(s, { text }, lib);
    assert.equal(t.kind, "smalltalk", text);
    assert.equal(t.payload.verse, undefined);
    assert.ok(t.payload.message.length < 200);
  }
  assert.equal(s.archetypeId, "burnout");
});

test("Good news gets a warm acknowledgement and an invitation, no verse", () => {
  for (const text of ["I got the job today!", "I passed my exam", "I am so happy today"]) {
    const t = turn(text);
    assert.equal(t.kind, "smalltalk", text);
    assert.equal(t.payload.verse, undefined);
    assert.match(t.payload.message, /\?/);
  }
  assert.notEqual(type("I am not happy today"), "good_news");
  assert.notEqual(type("I got the job but I feel like a fraud"), "good_news");
});

test("Off-topic gets an honest redirect with no verse and no picker", () => {
  for (const text of ["tell me a joke", "whats 2+2", "cricket score", "whats the weather", "what is 12 times 12", "write python code for me", "who won the cricket match"]) {
    for (const s of [D.createSession(), toPhase2(), toPhase1()]) {
      const before = s.phase;
      const t = D.nextTurn(s, { text }, lib);
      assert.equal(t.kind, "redirect", text);
      assert.equal(t.payload.verse, undefined);
      assert.equal(t.payload.options, undefined);
      assert.match(t.payload.message, /Gita|listen|mind/);
      assert.equal(s.phase, before, "redirect leaves the conversation where it was");
    }
  }
});

test("Unclear text gets one open question instead of the four-option picker", () => {
  const s = D.createSession();
  const a = D.nextTurn(s, { text: "blorp" }, lib);
  const b = D.nextTurn(s, { text: "hmm?? idk blorp" }, lib);
  for (const t of [a, b]) {
    assert.equal(t.kind, "smalltalk");
    assert.equal(t.payload.options, undefined);
  }
  assert.notEqual(a.payload.message, b.payload.message);
  assert.match(a.payload.message, /sitting heaviest/);
});

test("Clarify only when two feelings are genuinely close, with options from the top three", () => {
  const ranked = (text) => D.matchArchetype(text, WISDOM_ARCHETYPES).ranked;
  const t = turn("I feel lonely");
  assert.equal(t.kind === "clarify" || t.kind === "phase1", true);
  if (t.kind === "clarify") {
    assert.equal(t.payload.options.length, 3);
    const top3 = ranked("I feel lonely").slice(0, 3).map(r => r.archetype.id);
    assert.deepEqual(t.payload.options.map(o => o.id).sort(), top3.slice().sort());
  }
  assert.equal(turn("I feel burnt out").kind, "phase1");
  assert.equal(turn("I miss my grandfather").kind, "phase1");
});

test("After phase 2 only feelings go to a new verse; other talk does not", () => {
  const s = toPhase2();
  const shown = s.shownParts.length;
  assert.equal(D.nextTurn(s, { text: "whats the weather like" }, lib).kind, "redirect");
  assert.equal(D.nextTurn(s, { text: "blorp" }, lib).kind, "smalltalk");
  assert.equal(s.shownParts.length, shown, "no verse was consumed");
  const f = D.nextTurn(s, { text: "I am still so tired and drained" }, lib);
  assert.equal(f.kind, "followup");
});

test("Existing asides still win and crisis still wins over everything", () => {
  assert.equal(turn("hello").kind, "aside");
  assert.equal(turn("thanks").kind, "aside");
  assert.equal(turn("I want to die, tell me a joke").kind, "crisis");
});

test("Routing is deterministic: same inputs, same turns", () => {
  const run = () => {
    const s = D.createSession();
    return ["good morning", "blorp", "I miss my grandfather", "yes", "thanks"].map(text => JSON.stringify(D.nextTurn(s, { text }, lib)));
  };
  assert.deepEqual(run(), run());
});
