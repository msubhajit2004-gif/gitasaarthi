// Records a narrated screen video of the live app using Gemini: sign in, save a key in Settings, test the
// connection, then chat. Captions explain each step; a small panel lists every request that goes to Gemini.
// Run: TESTKEY=<a Gemini key> BASE_URL=https://your-site node tests/record_gemini_demo.mjs
// The key is typed into a password field, so the video shows only dots. A throwaway account is created and deleted.
import { chromium } from "playwright";
import { mkdirSync, renameSync, readdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const B = (process.env.BASE_URL || "https://gitasaarthi-gray.vercel.app").replace(/\/+$/, "");
const KEY = process.env.TESTKEY;
if (!KEY) { console.error("Set TESTKEY to a Gemini API key."); process.exit(1); }
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "videos"); mkdirSync(OUT, { recursive: true });
const TMP = join(OUT, "_rec"); rmSync(TMP, { recursive: true, force: true }); mkdirSync(TMP, { recursive: true });
const EMAIL = `demo${Date.now()}@example.com`, PW = "quiet river 42";

const browser = await chromium.launch({ headless: true });
// the account is made quietly first, so the recording starts at the sign-in page
const quiet = await browser.newContext();
await quiet.request.post(B + "/api/signup", { headers: { Origin: B }, data: { name: "Demo", email: EMAIL, password: PW } });
await quiet.close();

const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: TMP, size: { width: 1280, height: 720 } } });
const page = await ctx.newPage();
const lines = []; let caption = "";
const t0s = new Map();
page.on("request", (r) => { if (/\/api\/gemini\/generate/.test(r.url())) t0s.set(r, Date.now()); });
page.on("response", async (r) => {
  const u = new URL(r.url());
  if (!/\/api\/gemini\/(generate|test|models)/.test(u.pathname) && !(u.pathname === "/api/me/gemini" && r.request().method() !== "GET")) return;
  const t0 = t0s.get(r.request()); const secs = t0 ? ` (${((Date.now() - t0) / 1000).toFixed(1)} s)` : "";
  lines.push(`${r.request().method()} ${u.pathname}  ${r.status()}${secs}`);
  await draw().catch(() => {});
});

async function draw() {
  await page.evaluate(([cap, ls]) => {
    let d = document.getElementById("__demo");
    if (!d) {
      d = document.createElement("div"); d.id = "__demo";
      d.style.cssText = "position:fixed;left:50%;top:10px;transform:translateX(-50%);z-index:2147483647;width:560px;padding:10px 16px;background:rgba(12,12,10,.9);color:#f1e7cf;border:1px solid #d4b26a;border-radius:8px;font:500 17px/1.35 Georgia,serif;text-align:center;pointer-events:none";
      document.body.appendChild(d);
      const l = document.createElement("div"); l.id = "__demolog";
      l.style.cssText = "position:fixed;right:12px;top:58px;z-index:2147483647;width:330px;padding:8px 10px;background:rgba(12,12,10,.9);color:#cfe8cf;border:1px solid #4a8;border-radius:8px;font:12px/1.5 Consolas,monospace;pointer-events:none";
      const h = document.createElement("b"); h.style.color = "#d4b26a"; h.textContent = "Requests to Gemini"; l.appendChild(h);
      const box = document.createElement("div"); box.id = "__demolines"; l.appendChild(box);
      document.body.appendChild(l);
    }
    d.textContent = cap;
    const box = document.getElementById("__demolines");
    const rows = (ls.length ? ls : ["none yet"]).map((x) => { const r = document.createElement("div"); r.textContent = x; if (!ls.length) r.style.color = "#8a8"; return r; });
    box.replaceChildren(...rows);
  }, [caption, lines]);
}
async function say(text, ms = 2800) { caption = text; await draw(); await page.waitForTimeout(ms); }
const typeSlow = (sel, text, delay = 55) => page.type(sel, text, { delay });
const shot = (n) => page.screenshot({ path: join(TMP, `shot-${n}.png`) });

// 1. sign in
await page.goto(B + "/login.html"); await page.waitForTimeout(4800);
await say("Step 1: sign in. Your account holds the saved Gemini key, not this browser.");
await typeSlow("#email", EMAIL); await typeSlow("#password", PW, 45);
await page.press("#password", "Enter"); await page.waitForURL(/dashboard/); await page.waitForTimeout(900);
await say("Signed in. The dashboard shows your streak and mood.", 2200);
await page.goto(B + "/index.html"); await page.waitForTimeout(2200);

// 2. settings: key, switch, test
await say("Step 2: open Settings and add your Gemini key.", 2200);
await page.click("#nav-settings-btn"); await page.waitForTimeout(900);
await page.locator("#gemini-api-key-input").scrollIntoViewIfNeeded(); await page.waitForTimeout(600);
await say("The key goes in a password field: it is never shown on screen.", 2400);
await typeSlow("#gemini-api-key-input", KEY, 35);
await say("Save it. The server stores it encrypted and the browser never keeps it.", 2000);
await page.click("#gemini-key-save"); await page.waitForTimeout(2500); await draw();
await shot(1);
await say("Now only the last four characters are shown. Replace or remove it any time.", 2800);
if (!(await page.locator("#gemini-enabled-toggle").isChecked())) await page.locator("#gemini-enabled-toggle").check({ force: true }).catch(async () => { await page.click("label[for='gemini-enabled-toggle']"); });
await say("Switch Gemini on. Off, the app runs fully offline with pre-written verses.", 2800);
await page.locator("#test-gemini-key-btn").scrollIntoViewIfNeeded();
await say("Test connection: our server asks Google's Gemini a tiny question.", 1800);
await page.click("#test-gemini-key-btn"); await page.waitForTimeout(3200); await draw();
await shot(2);
await say("Connected. The panel at the right lists the real request that just went to Gemini.", 3200);
await page.locator("#gemini-model-select").scrollIntoViewIfNeeded();
await say("The model list comes from Google, so it only offers models your key can use.", 3000);
await page.keyboard.press("Escape"); await page.waitForTimeout(700);

// 3. chat
await say("Step 3: talk to Krishna. Every reply is a live call to Gemini.", 2400);
await typeSlow(".chat-input-textarea", "I keep thinking I will fail my exam tomorrow and I cannot sleep", 50);
await say("Send. The request goes: browser, our server, Google Gemini, and back.", 1800);
await page.keyboard.press("Enter");
await page.waitForSelector(".interactive-pill-btn", { timeout: 90000 }); await page.waitForTimeout(1200); await draw();
await shot(3);
await say("Krishna's first reply was written by Gemini for exactly this message (see the first call).", 3600);
await page.locator(".message-row").last().locator(".interactive-pill-btn").first().click();
await say("Choose an answer: that is the second call. Gemini now writes the verse and the practice.", 2200);
await page.waitForSelector(".cbt-title", { timeout: 90000 }); await page.waitForTimeout(1500); await draw();
await shot(4);
await say("Done: the Gita verse, its meaning, and a short CBT practice for this situation.", 3000);
await page.mouse.wheel(0, 380); await page.waitForTimeout(1800);
await page.mouse.wheel(0, 380); await page.waitForTimeout(1800);
await say(`${lines.filter((l) => /generate/.test(l)).length} Gemini replies in this conversation. If Gemini ever fails, the app says so and falls back to the offline verses.`, 4200);

// clean up the throwaway account, then finish the video
await page.evaluate(async (pw) => { await fetch("/api/me", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: pw }) }); }, PW).catch(() => {});
const video = page.video();
await ctx.close();
const src = await video.path();
const dest = join(OUT, "gemini-demo.webm");
renameSync(src, dest);
for (const f of readdirSync(TMP)) if (f.endsWith(".webm")) rmSync(join(TMP, f), { force: true });
console.log("VIDEO: " + dest);
console.log("calls shown:\n  " + lines.join("\n  "));
await browser.close();
