// Records one narrated video: a person uses the app with Gemini, then an admin looks at the admin panel.
// It runs a copy of the app on this computer (temporary database, made-up demo people), so no real account or
// email is ever on screen. Gemini calls are real: they go to Google with the key you give.
// Run: TESTKEY=<a Gemini key> node tests/record_full_demo.mjs      Output: videos/gemini-and-admin-demo.webm
import { chromium } from "playwright";
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, renameSync, rmSync, readdirSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const KEY = process.env.TESTKEY;
if (!KEY) { console.error("Set TESTKEY to a Gemini API key."); process.exit(1); }
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "videos"); mkdirSync(OUT, { recursive: true });
const REC = mkdtempSync(join(tmpdir(), "gs-rec-")), DATA = mkdtempSync(join(tmpdir(), "gs-data-"));
const port = await new Promise((res) => { const s = createServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => res(p)); }); });
const B = `http://127.0.0.1:${port}`;
const env = { ...process.env, PORT: String(port), GITASAARTHI_DB: join(DATA, "demo.db"), GITASAARTHI_SECRET_KEY_FILE: join(DATA, "k"), GITASAARTHI_NO_BROWSER: "1" };
delete env.TURSO_DATABASE_URL; delete env.TURSO_AUTH_TOKEN; delete env.VERCEL;
const server = spawn("python", ["server.py"], { cwd: ROOT, env, stdio: "ignore", windowsHide: true });
for (let i = 0; i < 80; i++) { try { if ((await fetch(`${B}/healthz`)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 250)); }

const PW = "quiet river 42", USER = "demo@example.com", ADMIN = "admin@example.com";
const browser = await chromium.launch({ headless: true });
const api = async (ctx, method, path, data) => (await ctx.request.fetch(B + path, { method, headers: { Origin: B }, data })).status();

// ---- made-up people and activity, set up quietly before recording (no real data anywhere)
const people = [["Asha", "asha"], ["Ravi", "ravi"], ["Meera", "meera"], ["Dev", "dev"], ["Priya", "priya"], ["Demo", "demo"], ["Admin Demo", "admin"]];
const topics = ["anxiety", "overthinking", "burnout", "heartbreak", "anxiety", "lost-purpose", "fear-of-failure"];
const day = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
for (const [i, [name, slug]] of people.entries()) {
  const c = await browser.newContext();
  await api(c, "POST", "/api/signup", { name, email: `${slug}@example.com`, password: PW });
  if (slug !== "admin" && slug !== "demo") {
    for (let k = 0; k < 2 + (i % 3); k++) await api(c, "POST", "/api/events", { type: "conversation", topic: topics[(i + k) % topics.length] });
    await api(c, "PUT", "/api/me/data/practice", { value: [day(0), day(1), day(2), ...(i % 2 ? [day(4)] : [])] });
    await api(c, "PUT", "/api/me/data/moods", { value: { [day(0)]: 2 + (i % 3), [day(1)]: 3, [day(3)]: 2 } });
  }
  if (slug === "meera") await api(c, "POST", "/api/events", { type: "crisis_shown" });   // one safety alert to review
  await c.close();
}
spawnSync("python", ["server.py", "--make-admin", ADMIN], { cwd: ROOT, env, stdio: "ignore" });
// spread the activity over the last days so the chart has a shape
spawnSync("python", ["-c", "import sqlite3,os,datetime as d;c=sqlite3.connect(os.environ['GITASAARTHI_DB']);ids=[r[0] for r in c.execute('select id from events order by id')]\n"
  + "for n,i in enumerate(ids): c.execute('update events set created_at=? where id=? and type=\\'conversation\\'',((d.datetime.now(d.timezone.utc)-d.timedelta(days=(n*3)%9,hours=n%5)).isoformat(timespec='seconds'),i))\nc.commit()"], { cwd: ROOT, env, stdio: "ignore" });

// ---- recording
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: REC, size: { width: 1280, height: 720 } } });
const page = await ctx.newPage();
const lines = []; let caption = ""; const t0s = new Map();
page.on("request", (r) => { if (/\/api\/gemini\/generate/.test(r.url())) t0s.set(r, Date.now()); });
page.on("response", async (r) => {
  const u = new URL(r.url());
  if (!/\/api\/gemini\/(generate|test|models)/.test(u.pathname) && !(u.pathname === "/api/me/gemini" && r.request().method() !== "GET")) return;
  const t0 = t0s.get(r.request()); lines.push(`${r.request().method()} ${u.pathname}  ${r.status()}${t0 ? ` (${((Date.now() - t0) / 1000).toFixed(1)} s)` : ""}`);
  await draw().catch(() => {});
});
async function draw() {
  await page.evaluate(([cap, ls, showLog]) => {
    let d = document.getElementById("__demo");
    if (!d) {
      d = document.createElement("div"); d.id = "__demo";
      d.style.cssText = "position:fixed;left:50%;top:10px;transform:translateX(-50%);z-index:2147483647;width:560px;padding:10px 16px;background:rgba(12,12,10,.9);color:#f1e7cf;border:1px solid #d4b26a;border-radius:8px;font:500 17px/1.35 Georgia,serif;text-align:center;pointer-events:none";
      document.body.appendChild(d);
      const l = document.createElement("div"); l.id = "__demolog";
      l.style.cssText = "position:fixed;right:12px;top:58px;z-index:2147483647;width:330px;padding:8px 10px;background:rgba(12,12,10,.9);color:#cfe8cf;border:1px solid #4a8;border-radius:8px;font:12px/1.5 Consolas,monospace;pointer-events:none";
      const h = document.createElement("b"); h.style.color = "#d4b26a"; h.textContent = "Requests to Gemini"; l.appendChild(h);
      const box = document.createElement("div"); box.id = "__demolines"; l.appendChild(box); document.body.appendChild(l);
    }
    d.textContent = cap;
    document.getElementById("__demolog").style.display = showLog ? "block" : "none";
    const box = document.getElementById("__demolines");
    box.replaceChildren(...(ls.length ? ls : ["none yet"]).map((x) => { const r = document.createElement("div"); r.textContent = x; if (!ls.length) r.style.color = "#8a8"; return r; }));
  }, [caption, lines, showLog]);
}
let showLog = true;
async function say(text, ms = 2800) { caption = text; await draw(); await page.waitForTimeout(ms); }
const typeSlow = (sel, text, delay = 55) => page.type(sel, text, { delay });
async function signIn(email) {
  await page.goto(B + "/login.html"); await page.waitForTimeout(900);
  await typeSlow("#email", email); await typeSlow("#password", PW, 45);
  await page.press("#password", "Enter"); await page.waitForURL(/dashboard/); await page.waitForTimeout(900);
}

// PART 1: a person uses the app with Gemini
await page.goto(B + "/login.html"); await page.waitForTimeout(4800);
await say("Part 1: a person using GitaSaarthi with Gemini. First, sign in.", 2600);
await typeSlow("#email", USER); await typeSlow("#password", PW, 45);
await page.press("#password", "Enter"); await page.waitForURL(/dashboard/); await page.waitForTimeout(800);
await page.goto(B + "/index.html"); await page.waitForTimeout(2000);
await say("Settings: add a Gemini key. It is typed into a password field, so it is never shown.", 2600);
await page.click("#nav-settings-btn"); await page.waitForTimeout(800);
await page.locator("#gemini-api-key-input").scrollIntoViewIfNeeded();
await typeSlow("#gemini-api-key-input", KEY, 35);
await page.click("#gemini-key-save"); await page.waitForTimeout(2400);
await say("Saved: the server keeps it encrypted; only the last four characters show.", 2600);
if (!(await page.locator("#gemini-enabled-toggle").isChecked())) await page.locator("#gemini-enabled-toggle").check({ force: true }).catch(async () => { await page.click("label[for='gemini-enabled-toggle']"); });
await say("Switch Gemini on, then press Test connection.", 1600);
await page.locator("#test-gemini-key-btn").scrollIntoViewIfNeeded(); await page.click("#test-gemini-key-btn"); await page.waitForTimeout(3000);
await say("Connected: the panel lists the real request that went to Gemini.", 2800);
await page.keyboard.press("Escape"); await page.waitForTimeout(600);
await say("Now chat. Every reply is a live call to Gemini.", 2200);
await typeSlow(".chat-input-textarea", "I keep thinking I will fail my exam tomorrow and I cannot sleep", 50);
await page.keyboard.press("Enter");
await page.waitForSelector(".interactive-pill-btn", { timeout: 90000 }); await page.waitForTimeout(1200);
await say("Reply 1: written by Gemini for exactly this message.", 3200);
await page.locator(".message-row").last().locator(".interactive-pill-btn").first().click();
await page.waitForSelector(".cbt-title", { timeout: 90000 }); await page.waitForTimeout(1500);
await say("Reply 2: the verse and a short practice, from a second Gemini call.", 3000);
await page.mouse.wheel(0, 380); await page.waitForTimeout(1600);

// PART 2: a normal account cannot open the admin panel
await say("Part 2: the admin panel. A normal account cannot open it.", 2400);
await page.goto(B + "/admin.html"); await page.waitForTimeout(600);
showLog = false; await say("Normal users get a 'forbidden' page. Only accounts made admin can enter.", 3200);
await page.evaluate(() => window.GSAccount && window.GSAccount.signOut()); await page.waitForTimeout(1800);

// PART 3: the admin signs in
await say("Sign in as an admin.", 1800);
await signIn(ADMIN);
await page.goto(B + "/admin.html"); await page.waitForTimeout(1800);
await say("Overview: people, activity this week, conversations, and how often Safe Harbor was shown.", 3800);
await page.mouse.wheel(0, 300); await page.waitForTimeout(1200);
await say("Conversations per day, and the feelings people chose most. No message text is ever stored.", 3800);
await page.mouse.wheel(0, 380); await page.waitForTimeout(1000);
await say("Safety review: every time crisis words were detected and Safe Harbor was shown.", 3600);
await say("The admin follows up with that person directly, then marks it reviewed.", 2600);
await page.getByText("Mark reviewed", { exact: true }).first().click(); await page.waitForTimeout(1800);
await say("Reviewed. The 'Needs review' count drops.", 2400);
await page.mouse.wheel(0, 420); await page.waitForTimeout(900);
await say("Users: name, join date, last active, streak and role. Search by name or email.", 3200);
await page.fill("#user-search", ""); await typeSlow("#user-search", "meera", 90); await page.waitForTimeout(2200);
await say("Search narrows the list. Admins see names and emails, never journals or messages.", 3600);
await say("That is the whole app: a private Gita companion on Gemini, with a careful admin view.", 3600);

const video = page.video();
await ctx.close();
const dest = join(OUT, "gemini-and-admin-demo.webm");
renameSync(await video.path(), dest);
console.log("VIDEO: " + dest);
await browser.close();
server.kill();
for (const d of [REC, DATA]) try { rmSync(d, { recursive: true, force: true }); } catch {}
for (const f of readdirSync(OUT)) if (f.startsWith("_rec")) rmSync(join(OUT, f), { recursive: true, force: true });
