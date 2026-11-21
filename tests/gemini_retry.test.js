// Models differ in which thinking settings they accept: with a real key, gemini-3-flash-preview accepts
// thinkingBudget 0 while gemini-3.5-flash-lite answers 400 to it (and works without it). The app must recover.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const SRC = fs.readFileSync(path.join(__dirname, "..", "js", "gemini_service.js"), "utf8");
const REPLY = { candidates: [{ content: { parts: [{ text: JSON.stringify({ acknowledgment: "a", question1: "q1", question2: "q2", quickPills: [] }) }] } }] };

function service(model, behaviour) {
  const win = {};
  const sandbox = { window: win, localStorage: { getItem: () => null, setItem() {} }, console, fetch: () => { throw new Error("no network in tests"); } };
  vm.runInNewContext(SRC + "\n;this.__svc = window.geminiService;", sandbox);
  const svc = sandbox.__svc;
  svc.state = { hasKey: true, enabled: true, keyHint: "x", model };
  svc.calls = [];
  svc._api = async (method, url, body) => { svc.calls.push(body.generationConfig); return behaviour(body, svc.calls.length); };
  return svc;
}
const bad400 = () => { const e = new Error("Request contains an invalid argument."); e.status = 400; return e; };

test("a model that rejects the thinking setting is retried without it", async () => {
  const svc = service("gemini-3.5-flash-lite", (body) => { if (body.generationConfig.thinkingConfig) throw bad400(); return REPLY; });
  const out = await svc.generateCounsel("hello", [], 1);
  assert.equal(out.acknowledgment, "a");
  assert.equal(svc.calls.length, 2);
  assert.ok(svc.calls[0].thinkingConfig, "the first try keeps thinking off");
  assert.ok(!svc.calls[1].thinkingConfig, "the retry leaves the setting out");
});

test("the app remembers it for that model and does not send the rejected setting again", async () => {
  const svc = service("gemini-3.5-flash-lite", (body) => { if (body.generationConfig.thinkingConfig) throw bad400(); return REPLY; });
  await svc.generateCounsel("one", [], 1);
  svc.calls.length = 0;
  await svc.generateCounsel("two", [], 1);
  assert.equal(svc.calls.length, 1);
  assert.ok(!svc.calls[0].thinkingConfig);
});

test("a model that accepts it is sent it once, with no retry", async () => {
  const svc = service("gemini-3-flash-preview", () => REPLY);
  await svc.generateCounsel("hello", [], 1);
  assert.equal(svc.calls.length, 1);
  assert.equal(JSON.stringify(svc.calls[0].thinkingConfig), JSON.stringify({ thinkingBudget: 0 }));
});

test("other errors are not retried", async () => {
  for (const status of [401, 429, 500, 502]) {
    const svc = service("gemini-3-flash-preview", () => { const e = new Error("x"); e.status = status; throw e; });
    await assert.rejects(() => svc.generateCounsel("hello", [], 1), (e) => e.status === status);
    assert.equal(svc.calls.length, 1, `status ${status}`);
  }
});

test("a Pro model never gets the thinking setting", async () => {
  const svc = service("gemini-2.5-pro", () => REPLY);
  await svc.generateCounsel("hello", [], 1);
  assert.ok(!svc.calls[0].thinkingConfig);
});
