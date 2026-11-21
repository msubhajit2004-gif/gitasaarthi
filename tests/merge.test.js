"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { merge3 } = require("../js/merge.js");

const clone = (x) => JSON.parse(JSON.stringify(x));
const E = (id, notes, extra) => Object.assign({ id: "journal-" + id, date: "1 Jan", notes: notes || "" }, extra || {});
const ids = (a) => a.map((e) => e.id);

test("null handling", () => {
  assert.deepEqual(merge3("moods", null, { a: 1 }, null), { a: 1 });
  assert.deepEqual(merge3("moods", null, null, { a: 1 }), { a: 1 });
  assert.deepEqual(merge3("journal", null, undefined, [E(1)]), [E(1)]);
  assert.equal(merge3("last", null, null, null), null);
  assert.deepEqual(merge3("journal", null, [E(1)], undefined), [E(1)]);
});

test("journal: new on this device kept, at the front like the app does", () => {
  const out = merge3("journal", [E(1)], [E(3), E(1)], [E(2), E(1)]);
  assert.deepEqual(ids(out), ["journal-3", "journal-2", "journal-1"]);
});
test("journal: first hydrate (base null) keeps local-only entry", () => {
  const out = merge3("journal", null, [E(5)], [E(2)]);
  assert.deepEqual(ids(out), ["journal-5", "journal-2"]);
});
test("journal: edited here, server unchanged -> local", () => {
  const out = merge3("journal", [E(1, "a")], [E(1, "mine")], [E(1, "a")]);
  assert.equal(out[0].notes, "mine");
});
test("journal: only server changed -> server", () => {
  const out = merge3("journal", [E(1, "a")], [E(1, "a")], [E(1, "theirs")]);
  assert.equal(out[0].notes, "theirs");
});
test("journal: both changed -> later updatedAt, else local", () => {
  let out = merge3("journal", [E(1, "a")], [E(1, "L", { updatedAt: 5 })], [E(1, "S", { updatedAt: 9 })]);
  assert.equal(out[0].notes, "S");
  out = merge3("journal", [E(1, "a")], [E(1, "L", { updatedAt: 9 })], [E(1, "S", { updatedAt: 5 })]);
  assert.equal(out[0].notes, "L");
  out = merge3("journal", [E(1, "a")], [E(1, "L")], [E(1, "S")]);
  assert.equal(out[0].notes, "L");
});
test("journal: deletion here is not resurrected", () => {
  const out = merge3("journal", [E(1), E(2)], [E(2)], [E(1), E(2)]);
  assert.deepEqual(ids(out), ["journal-2"]);
});
test("journal: edit elsewhere beats delete here", () => {
  const out = merge3("journal", [E(1, "a")], [], [E(1, "edited")]);
  assert.deepEqual(out, [E(1, "edited")]);
});
test("journal: deleted elsewhere is dropped unless edited here", () => {
  assert.deepEqual(merge3("journal", [E(1, "a"), E(2)], [E(1, "a"), E(2)], [E(2)]), [E(2)]);
  assert.deepEqual(ids(merge3("journal", [E(1, "a"), E(2)], [E(1, "mine"), E(2)], [E(2)])), ["journal-1", "journal-2"]);
});
test("journal: both added same id", () => {
  assert.deepEqual(merge3("journal", [], [E(1, "x")], [E(1, "x")]), [E(1, "x")]);
  assert.equal(merge3("journal", [], [E(1, "L")], [E(1, "S")]).length, 1);
});
test("journal: server order preserved", () => {
  const s = [E(3), E(1), E(2)];
  assert.deepEqual(ids(merge3("journal", s, s, s)), ids(s));
});

test("practice: sorted union", () => {
  assert.deepEqual(merge3("practice", ["2025-01-01"], ["2025-01-03", "2025-01-01"], ["2025-01-02", "2025-01-01"]),
    ["2025-01-01", "2025-01-02", "2025-01-03"]);
});
test("moods: union; same key local if changed here else server", () => {
  const base = { a: 3, b: 3 };
  const out = merge3("moods", base, { a: 5, b: 3, c: 1 }, { a: 2, b: 4, d: 2 });
  assert.deepEqual(out, { a: 5, b: 4, c: 1, d: 2 });
});
test("last: larger at wins, tie -> local", () => {
  assert.equal(merge3("last", null, { id: "x", at: 5 }, { id: "y", at: 9 }).id, "y");
  assert.equal(merge3("last", null, { id: "x", at: 9 }, { id: "y", at: 5 }).id, "x");
  assert.equal(merge3("last", null, { id: "x", at: 5 }, { id: "y", at: 5 }).id, "x");
});

test("idempotent", () => {
  const vals = { journal: [E(2), E(1, "a")], practice: ["2025-01-01"], moods: { a: 1 }, last: { id: "k", at: 3 } };
  Object.keys(vals).forEach((k) => assert.deepEqual(merge3(k, vals[k], vals[k], vals[k]), vals[k]));
});
test("does not mutate inputs", () => {
  const b = [E(1, "a")], l = [E(1, "mine"), E(9)], s = [E(1, "theirs"), E(2)];
  const snap = clone([b, l, s]);
  const out = merge3("journal", b, l, s);
  out[0].notes = "changed"; out.push(1);
  assert.deepEqual([b, l, s], snap);
  const m = [{ a: 1 }, { a: 2 }, { b: 1 }], ms = clone(m);
  merge3("moods", m[0], m[1], m[2]);
  assert.deepEqual(m, ms);
});
test("junk inputs do not throw", () => {
  const junk = [null, undefined, 5, "x", [], {}, [1, null, "a"], { a: {} }, true, [{ id: null }, { noid: 1 }]];
  ["journal", "practice", "moods", "last", "other"].forEach((k) =>
    junk.forEach((b) => junk.forEach((l) => junk.forEach((s) => { merge3(k, b, l, s); }))));
});
