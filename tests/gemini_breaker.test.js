// Circuit breaker + short-answer helper for GeminiService.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const SRC = fs.readFileSync(path.join(__dirname, "..", "js", "gemini_service.js"), "utf8");
const COUNSEL = { candidates: [{ content: { parts: [{ text: JSON.stringify({ acknowledgment: "a", question1: "q1", question2: "q2", quickPills: [] }) }] } }] };
const textReply = (t) => ({ candidates: [{ content: { parts: [{ text: t }] } }] });
const MIN = 60 * 1000;

function service(behaviour, model = "gemini-3-flash-preview") {
  const sandbox = { window: {}, localStorage: { getItem: () => null, setItem() {} }, console, fetch: () => { throw new Error("no network"); } };
  vm.runInNewContext(SRC + "\n;this.__svc = window.geminiService;", sandbox);
  const svc = sandbox.__svc;
  svc.state = { hasKey: true, enabled: true, keyHint: "x", model };
  svc.clock = 1000000;
  svc.now = () => svc.clock;
  svc.bodies = [];
  svc._api = async (method, url, body) => { svc.bodies.push(body); return behaviour(body, svc.bodies.length); };
  return svc;
}
const fail = (status) => () => { const e = new Error("boom"); e.status = status; throw e; };
const tryCounsel = (svc) => svc.generateCounsel("hi", [], 1).catch((e) => e);

test("breaker stays closed after one failure and opens after two", async () => {
  const svc = service(fail(500));
  await tryCounsel(svc);
  assert.equal(svc.isAvailable(), true);
  await tryCounsel(svc);
  assert.equal(svc.isAvailable(), false);
  assert.equal(svc.hasValidKey(), true);
});

test("while cooling down generateCounsel throws at once without calling _api", async () => {
  const svc = service(fail(503));
  await tryCounsel(svc); await tryCounsel(svc);
  const before = svc.bodies.length;
  const e = await tryCounsel(svc);
  assert.equal(e.code, "gemini_cooling_down");
  assert.equal(e.status, 503);
  assert.equal(svc.bodies.length, before);
  const e2 = await svc.generateAnswer("hello").catch((x) => x);
  assert.equal(e2.code, "gemini_cooling_down");
  assert.equal(svc.bodies.length, before);
});

test("breaker closes after five minutes", async () => {
  const svc = service(fail(500));
  await tryCounsel(svc); await tryCounsel(svc);
  svc.clock += 5 * MIN - 1;
  assert.equal(svc.isAvailable(), false);
  svc.clock += 2;
  assert.equal(svc.isAvailable(), true);
  const before = svc.bodies.length;
  await tryCounsel(svc);
  assert.equal(svc.bodies.length, before + 1, "calls go out again");
});

test("a success resets the counter", async () => {
  let n = 0;
  const svc = service(() => { n++; if (n === 2) return COUNSEL; throw Object.assign(new Error("x"), { status: 500 }); });
  await tryCounsel(svc);          // fail 1
  await tryCounsel(svc);          // success
  await tryCounsel(svc);          // fail 1 again
  assert.equal(svc.isAvailable(), true);
  await tryCounsel(svc);          // fail 2
  assert.equal(svc.isAvailable(), false);
});

test("401 never opens the breaker", async () => {
  const svc = service(fail(401));
  for (let i = 0; i < 5; i++) await tryCounsel(svc);
  assert.equal(svc.isAvailable(), true);
  assert.equal(svc.bodies.length, 5);
});

test("'Gemini is not switched on.' does not count", async () => {
  const svc = service(() => COUNSEL);
  svc.state.enabled = false;
  for (let i = 0; i < 4; i++) {
    const e = await tryCounsel(svc);
    assert.equal(e.message, "Gemini is not switched on.");
  }
  svc.state.enabled = true;
  assert.equal(svc.isAvailable(), true);
  assert.equal(svc.lastFailure, null);
});

test("the 400 thinking retry that then succeeds is not a failure", async () => {
  const svc = service((body) => { if (body.generationConfig.thinkingConfig) throw Object.assign(new Error("bad"), { status: 400 }); return COUNSEL; });
  await tryCounsel(svc); await tryCounsel(svc); await tryCounsel(svc);
  assert.equal(svc.isAvailable(), true);
  assert.equal(svc.lastFailure, null);
});

test("an empty reply counts as a failure", async () => {
  const svc = service(() => ({}));
  await tryCounsel(svc); await tryCounsel(svc);
  assert.equal(svc.isAvailable(), false);
});

test("consumeFallbackNotice is true once per failure episode", async () => {
  const svc = service(fail(500));
  assert.equal(svc.consumeFallbackNotice(), false, "nothing failed yet");
  await tryCounsel(svc);
  assert.equal(svc.consumeFallbackNotice(), true);
  assert.equal(svc.consumeFallbackNotice(), false);
  await tryCounsel(svc);
  assert.equal(svc.consumeFallbackNotice(), false, "same episode");
  svc.clock += 5 * MIN + 1;
  svc.isAvailable();              // cooldown ends
  await tryCounsel(svc);          // new episode
  assert.equal(svc.consumeFallbackNotice(), true);
});

test("consumeFallbackNotice resets after a success", async () => {
  let ok = false;
  const svc = service(() => { if (ok) return COUNSEL; throw Object.assign(new Error("x"), { status: 500 }); });
  await tryCounsel(svc);
  assert.equal(svc.consumeFallbackNotice(), true);
  ok = true;
  await tryCounsel(svc);
  assert.equal(svc.consumeFallbackNotice(), false);
  ok = false;
  await tryCounsel(svc);
  assert.equal(svc.consumeFallbackNotice(), true);
});

test("lastFailure reports time, status and message", async () => {
  const svc = service(fail(429));
  await tryCounsel(svc);
  assert.deepEqual({ ...svc.lastFailure }, { at: 1000000, status: 429, message: "boom" });
  const svc2 = service(() => { throw new Error("offline"); });
  await tryCounsel(svc2);
  assert.equal(svc2.lastFailure.status, null);
});

test("generateAnswer sends the persona, no json mime type, short settings", async () => {
  const svc = service(() => textReply("  Be gentle with yourself.  "));
  const out = await svc.generateAnswer("what is karma yoga?", [{ sender: "user", content: "hi" }, { sender: "bot", content: "hello" }]);
  assert.equal(out, "Be gentle with yourself.");
  const b = svc.bodies[0];
  assert.ok(!("responseMimeType" in b.generationConfig));
  assert.equal(b.generationConfig.maxOutputTokens, 400);
  assert.equal(b.generationConfig.temperature, 0.6);
  assert.deepEqual({ ...b.generationConfig.thinkingConfig }, { thinkingBudget: 0 });
  assert.match(b.systemInstruction.parts[0].text, /^You are Krishna speaking gently with a person using GitaSaarthi/);
  assert.match(b.systemInstruction.parts[0].text, /Never pretend to be a human\.$/);
  assert.equal(b.contents.length, 3);
  assert.equal(b.contents[1].role, "model");
  assert.equal(b.contents[2].parts[0].text, "what is karma yoga?");
});

test("generateAnswer retries without thinkingConfig on 400", async () => {
  const svc = service((body) => { if (body.generationConfig.thinkingConfig) throw Object.assign(new Error("bad"), { status: 400 }); return textReply("ok"); }, "gemini-3.5-flash-lite");
  assert.equal(await svc.generateAnswer("hi"), "ok");
  assert.equal(svc.bodies.length, 2);
  assert.ok(!svc.bodies[1].generationConfig.thinkingConfig);
  assert.ok(svc.isAvailable());
});

test("generateAnswer throws on empty and counts toward the breaker", async () => {
  const svc = service(() => textReply("   "));
  await assert.rejects(() => svc.generateAnswer("hi"), /empty/i);
  await svc.generateAnswer("hi").catch(() => {});
  assert.equal(svc.isAvailable(), false);
});

test("generateAnswer throws 'not switched on' without counting", async () => {
  const svc = service(() => textReply("x"));
  svc.state.enabled = false;
  await assert.rejects(() => svc.generateAnswer("hi"), /not switched on/);
  assert.equal(svc.bodies.length, 0);
});
