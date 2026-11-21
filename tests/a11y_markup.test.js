// Screen-reader structure of the app page, guarded without a browser. (The full axe-core audit found these.)
// Run: node --test tests/
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");
const index = read("index.html");

test("the conversation area is the page's main landmark and keeps its live announcements", () => {
  const m = index.match(/<main\b[^>]*id="chat-viewport"[^>]*>/);
  assert.ok(m, "main#chat-viewport exists");
  assert.ok(!/\brole=/.test(m[0]), "a role on <main> replaces the landmark (and 'log' is not allowed there)");
  assert.match(m[0], /aria-live="polite"/, "new replies are still announced");
  assert.match(m[0], /aria-label="[^"]+"/, "the landmark has a name");
});

test("the message box is not a second page footer", () => {
  assert.ok(!/<footer\b[^>]*composer-wrapper/.test(index), "composer-wrapper must not be a <footer>");
  assert.ok((index.match(/<footer\b/g) || []).length <= 1, "at most one footer landmark in the page source");
});

test("the animated verse never puts aria-label on a plain element", () => {
  const fx = read("js/effects.js");
  const splitText = fx.slice(fx.indexOf("function splitText"), fx.indexOf("// ---------------------------------------------------------------- 2. Text Type"));
  assert.ok(!/setAttribute\("aria-label"/.test(splitText), "aria-label on a div/p with no role is ignored; use a visually hidden copy");
  assert.match(splitText, /sr-only/, "the full text is kept for screen readers in a visually hidden element");
});

test("a visually hidden helper class exists", () => {
  assert.match(read("css/plate.css") + read("css/styles.css"), /\.sr-only\s*\{/);
});
