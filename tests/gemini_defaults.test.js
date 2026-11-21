// The model names offered and defaulted to in the browser must be ones that answer (checked with a real key):
// gemini-3-flash-preview and gemini-3.1-flash-lite answer in 2-3 s; gemini-2.5-flash is retired and
// gemini-3.8-flash / gemini-3.5-flash hung. Run: node --test tests/
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const read = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");

test("no browser file defaults to or recommends a model that does not answer", () => {
  for (const f of ["js/gemini_service.js", "js/app.js", "index.html"]) {
    const src = read(f);
    assert.ok(!/gemini-3\.8-flash/.test(src.replace(/["']gemini-2\.5-flash["'][^\n]*gemini-3-flash-preview/g, "")), `${f} still mentions gemini-3.8-flash`);
    assert.ok(!/recommended[^\n]*gemini-2\.5|gemini-2\.5-flash[^\n]*recommended/.test(src), `${f} recommends gemini-2.5-flash`);
  }
});

test("the default model in the browser matches the server's", () => {
  const server = read("server.py").match(/GEMINI_DEFAULT_MODEL = "([^"]+)"/)[1];
  assert.equal(server, "gemini-3-flash-preview");
  assert.match(read("js/gemini_service.js"), new RegExp(`model: "${server}"`));
  assert.match(read("index.html"), new RegExp(`<option value="${server}"`));
  assert.match(read("js/app.js"), new RegExp(`id: "${server}"`));
});

test("thinking is switched off for every Flash model, not only 2.5 (measured: 2.4 s instead of 4.3 s)", () => {
  const src = read("js/gemini_service.js");
  assert.match(src, /thinkingBudget: 0/);
  assert.match(src, /\/flash\/i?\.test\(modelName\)/, "keyed on 'flash', so 3.x Flash models are covered; Pro models must keep thinking");
  assert.ok(!/\/2\\.5\/\.test\(modelName\)/.test(src), "the old 2.5-only condition is gone");
});
