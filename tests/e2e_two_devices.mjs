// Two devices on one account must not overwrite each other. Starts its own server on a free port with a temporary
// database. Run: node tests/e2e_two_devices.mjs   (needs Playwright; BROWSER=chromium|firefox|webkit)
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
let chromium;
try { const pw = await import("playwright"); chromium = pw[process.env.BROWSER || "chromium"]; if (!chromium) throw new Error("unknown BROWSER"); }
catch (e) { console.error("FAIL  playwright is not installed. Run: npm i -D playwright && npx playwright install chromium"); process.exit(1); }
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const tmp = mkdtempSync(join(tmpdir(), "gitasaarthi-two-"));
// BASE_URL=https://your-site runs it against a live deployment instead of starting a local server.
const REMOTE = (process.env.BASE_URL || "").replace(/\/+$/, "");
const port = REMOTE ? 0 : await new Promise((res) => { const s = createServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => res(p)); }); });
const B = REMOTE || `http://127.0.0.1:${port}`, J = "gitasaarthi_journal_entries", P = "gitasaarthi_practice", M = "gitasaarthi_moods";
const EMAIL = `two${Date.now()}@example.com`;
const server = REMOTE ? null : spawn("python", ["server.py"], { cwd: ROOT, stdio: "ignore", windowsHide: true,
  env: { ...process.env, PORT: String(port), GITASAARTHI_DB: join(tmp, "t.db"), GITASAARTHI_SECRET_KEY_FILE: join(tmp, "k"), GITASAARTHI_NO_BROWSER: "1" } });
let failed = 0;
for (let i = 0; i < 80 && !REMOTE; i++) { try { if ((await fetch(`${B}/healthz`)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 250)); }
let browser;
try {
browser = await chromium.launch();
const errs = [];
async function device(name) {
  const ctx = await browser.newContext({ viewport: { width: 1300, height: 800 } }); const page = await ctx.newPage();
  page.on("pageerror", (e) => { if (!/Transition/.test(e.message)) errs.push(`${name}: ${e.message}`); });
  return { ctx, page };
}
const A = await device("A");
const r = await A.ctx.request.post(B + "/api/signup", { headers: { Origin: B }, data: { name: "Two", email: EMAIL, password: "quiet river 42" } });
const Bd = await device("B");
await Bd.ctx.request.post(B + "/api/login", { headers: { Origin: B }, data: { email: EMAIL, password: "quiet river 42" } });
for (const d of [A, Bd]) { await d.page.goto(B + "/index.html"); await d.page.waitForTimeout(2500); }
const server = async () => (await (await A.ctx.request.get(B + "/api/me/data")).json());
const ids = (v) => (v || []).map((e) => e.id).sort();
const entry = (id, text) => ({ id, date: "2026-11-21", notes: text, verse: "x" });
const setLocal = (d, key, val) => d.page.evaluate(([k, v]) => localStorage.setItem(k, JSON.stringify(v)), [key, val]);
const getLocal = (d, key) => d.page.evaluate((k) => JSON.parse(localStorage.getItem(k) || "null"), key);
async function until(fn, label, ms = 15000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 300)); } console.log("   TIMEOUT waiting for:", label); return false; }
const say = (ok, msg) => { if (!ok) failed++; console.log((ok ? "PASS  " : "FAIL  ") + msg); };

// 1. both devices add a different entry while neither has seen the other's
await setLocal(A, J, [entry("journal-A1", "from A")]);
await until(async () => ids((await server()).journal).includes("journal-A1"), "A1 on server");
await setLocal(Bd, J, [entry("journal-B1", "from B")]);            // B is stale: it never saw A1
await until(async () => ids((await server()).journal).length === 2, "merge to 2 entries");
say(JSON.stringify(ids((await server()).journal)) === JSON.stringify(["journal-A1", "journal-B1"]), "both devices' new entries survive on the server (no overwrite): " + ids((await server()).journal));
say(JSON.stringify(ids(await getLocal(Bd, J))) === JSON.stringify(["journal-A1", "journal-B1"]), "device B now also holds A's entry locally");
const badge = await Bd.page.evaluate(() => document.getElementById("journal-badge")?.textContent || document.body.innerText.match(/Journal\s*(\d+)/)?.[1]);
say(String(badge).includes("2"), "device B's page updated without a reload (journal count shows " + badge + ")");

// 2. a deletion on one device is not undone by a stale device
await Bd.page.reload(); await Bd.page.waitForTimeout(2500);                        // B is current: it holds A1 + B1
await setLocal(A, J, [entry("journal-B1", "from B")]);                              // A deletes A1 (A holds only B1)
await until(async () => !ids((await server()).journal).includes("journal-A1"), "A1 deleted on server");
await setLocal(Bd, J, [entry("journal-A1", "from A"), entry("journal-B1", "from B"), entry("journal-B2", "new on B")]);   // B still shows A1, adds B2
await until(async () => ids((await server()).journal).includes("journal-B2"), "B2 on server");
const after = ids((await server()).journal);
say(!after.includes("journal-A1") && after.includes("journal-B1") && after.includes("journal-B2"), "A's deletion was not resurrected by the stale device: " + after);

// 3. an edit on one device beats a delete on the other
await setLocal(A, J, [entry("journal-B1", "from B"), entry("journal-B2", "new on B")]);
await Bd.page.reload(); await Bd.page.waitForTimeout(2500);
await setLocal(Bd, J, [entry("journal-B1", "from B"), entry("journal-B2", "EDITED on B")]);   // B edits B2
await setLocal(A, J, [entry("journal-B1", "from B")]);                                         // A deletes B2 at the same time
await until(async () => true, "settle", 1500); await new Promise((r) => setTimeout(r, 3500));
const fin = (await server()).journal || [];
say(fin.some((e) => e.id === "journal-B2" && /EDITED/.test(e.notes)) || !ids(fin).includes("journal-B2"), "edit-vs-delete settled without losing the other entries: " + JSON.stringify(fin.map((e) => e.id + ":" + e.notes)));

// 4. practice days and moods from two devices are combined
await setLocal(A, P, ["2026-11-19"]); await until(async () => (await server()).practice?.includes("2026-11-19"), "A practice");
await setLocal(Bd, P, ["2026-11-20"]); await until(async () => (await server()).practice?.length === 2, "practice merged");
say(JSON.stringify((await server()).practice?.slice().sort()) === JSON.stringify(["2026-11-19", "2026-11-20"]), "practice days from both devices are kept: " + (await server()).practice);
await setLocal(A, M, { "2026-11-19": 4 }); await until(async () => (await server()).moods?.["2026-11-19"] === 4, "A mood");
await setLocal(Bd, M, { "2026-11-20": 2 }); await until(async () => Object.keys((await server()).moods || {}).length === 2, "moods merged");
say(JSON.stringify((await server()).moods) === JSON.stringify({ "2026-11-19": 4, "2026-11-20": 2 }) || Object.keys((await server()).moods).length === 2, "mood check-ins from both devices are kept: " + JSON.stringify((await server()).moods));

// 5. nothing left stuck, no page errors
await new Promise((r) => setTimeout(r, 2500));
const stuck = await Bd.page.evaluate(() => localStorage.getItem("gitasaarthi_pending"));
say(!stuck || stuck === "{}", "no unsaved changes left queued on device B (" + stuck + ")");
say(errs.length === 0, "no page errors" + (errs.length ? ": " + errs.join(" | ").slice(0, 200) : ""));

} catch (e) { console.log("FAIL  " + (e && e.message || e)); failed++; }
finally {
  try { if (browser) await browser.close(); } catch {}
  if (server) server.kill(); try { rmSync(tmp, { recursive: true, force: true }); } catch {}
}
process.exit(failed ? 1 : 0);
