// The dashboard shows an "Admin" link only to admins. The server still checks the role on every request;
// this link is a convenience, never the protection.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const read = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");

test("dashboard has an Admin link that is hidden until the page knows the role", () => {
  const html = read("dashboard.html");
  const m = html.match(/<a\b[^>]*id="admin-link"[^>]*>/);
  assert.ok(m, "an #admin-link exists");
  assert.match(m[0], /\bhidden\b/, "hidden by default");
  assert.match(m[0], /href="\/admin\.html"/);
});

test("only the admin role reveals it", () => {
  const src = read("js/site.js");
  assert.match(src, /role === "admin"/);
  assert.match(src, /admin-link/);
});

test("a hidden link really is hidden (the link style would otherwise override the attribute)", () => {
  assert.match(read("css/site.css"), /#admin-link\[hidden\]\s*\{\s*display:\s*none/);
});
