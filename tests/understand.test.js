// Tests for feeling retrieval (js/understand.js). Run: node --test tests/
const test = require("node:test");
const assert = require("node:assert/strict");
const { WISDOM_ARCHETYPES } = require("../js/curated_wisdom.js");
const U = require("../js/understand.js");
const D = require("../js/dialogue.js");

const index = U.buildIndex(WISDOM_ARCHETYPES);
const top = (text, n = 1) => U.rank(text, index).slice(0, n).map(r => r.id);

test("rank returns every archetype once, sorted, scores in 0..1", () => {
  const r = U.rank("I feel anxious", index);
  assert.equal(r.length, WISDOM_ARCHETYPES.length);
  for (let i = 0; i < r.length; i++) {
    assert.ok(r[i].score >= 0 && r[i].score <= 1);
    if (i) assert.ok(r[i - 1].score >= r[i].score);
  }
  assert.ok(U.MIN_SCORE > 0 && U.MIN_SCORE < 1);
  assert.ok(U.SYNONYMS && typeof U.SYNONYMS === "object");
});

test("paraphrases reach the right feeling", () => {
  assert.equal(top("I miss my grandfather")[0], "grief");
  assert.ok(top("I had a fight with my mom", 2).some(id => ["anger", "heartbreak"].includes(id)));
  assert.ok(top("I cant sleep at night thinking", 2).some(id => ["anxiety", "overthinking"].includes(id)));
  assert.equal(top("I feel nothing, empty inside")[0], "depression");
  assert.equal(top("my salary is not enough for the month")[0], "financial");
  assert.equal(top("I feel guilty about what I said")[0], "guilt");
  assert.ok(top("I keep comparing myself to others", 3).some(id => ["jealousy", "imposter", "perfectionism"].includes(id)));
  assert.equal(top("I am so stressed about exams")[0], "fear_of_failure");
  assert.equal(top("my boss yelled at me today")[0], "workplace");
});

test("Hindi and Hinglish words map to feelings", () => {
  assert.equal(top("bahut tension hai")[0], "anxiety");
  assert.equal(top("pareshan hoon yaar")[0], "anxiety");
  assert.equal(top("pareshaan hu")[0], "anxiety");
  assert.equal(top("akela feel karta hoon")[0], "loneliness");
  assert.ok(top("dukh bahut hai", 2).some(id => ["grief", "depression"].includes(id)));
  assert.equal(top("mera dil toot gaya")[0], "heartbreak");
  assert.equal(top("mujhe bahut ghussa aata hai")[0], "anger");
  assert.equal(top("main thak gaya hoon")[0], "burnout");
});

test("common typos still match", () => {
  assert.equal(top("i feel anxius and nervus")[0], "anxiety");
  assert.equal(top("i am depresed")[0], "depression");
});

test("unrelated text stays below MIN_SCORE", () => {
  for (const t of ["whats the weather", "what is 12 times 12", "tell me a joke", "write python code for me", "who won the cricket match"]) {
    assert.ok(U.rank(t, index)[0].score < U.MIN_SCORE, t);
  }
  assert.ok(U.rank("", index)[0].score < U.MIN_SCORE);
});

test("negated feelings do not match", () => {
  assert.ok(U.rank("I am not sad at all", index)[0].score < U.MIN_SCORE);
  assert.equal(top("I have no friends at all")[0], "loneliness");
});

test("matchArchetype keeps its shape and uses Understand when loaded", () => {
  const m = D.matchArchetype("I miss my grandfather", WISDOM_ARCHETYPES);
  assert.equal(m.archetype.id, "grief");
  assert.ok(m.score > 0 && Array.isArray(m.ranked));
  assert.ok(m.ranked[0].archetype && typeof m.ranked[0].score === "number");
  assert.equal(D.matchArchetype("whats the weather", WISDOM_ARCHETYPES).archetype, null);
});
