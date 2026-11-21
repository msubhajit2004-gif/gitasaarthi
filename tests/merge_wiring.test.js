// After a merge or a late load, the page must redraw what it shows. account.js announces 'gs:hydrated'.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const read = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");

for (const f of ["js/app.js", "js/plate.js", "js/dashboard-boot.js"]) {
  test(`${f} redraws on gs:hydrated`, () => {
    assert.match(read(f), /addEventListener\(\s*["']gs:hydrated["']/);
  });
}

test("merge.js loads before account.js on every page that loads account.js", () => {
  for (const f of ["index.html", "dashboard.html", "admin.html"]) {
    const html = read(f);
    const a = html.indexOf("js/account.js"), m = html.indexOf("js/merge.js");
    assert.ok(m > -1 && a > -1 && m < a, `${f}: merge.js must come before account.js`);
  }
});
