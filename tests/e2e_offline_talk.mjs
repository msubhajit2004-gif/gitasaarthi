// Browser check of the offline conversation with Gemini off: small talk, a Gita question, an off-topic
// request and a feeling must each get the right kind of reply. Starts its own server on a temporary database.
// Run: node tests/e2e_offline_talk.mjs        (BROWSER=chromium|firefox|webkit, default chromium)
import { chromium, firefox, webkit } from "playwright";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ENGINE = { chromium, firefox, webkit }[process.env.BROWSER || "chromium"] || chromium;
const port = await new Promise((res) => { const s = createServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => res(p)); }); });
const B = `http://127.0.0.1:${port}`;
const DATA = mkdtempSync(join(tmpdir(), "gs-offline-"));
const env = { ...process.env, PORT: String(port), GITASAARTHI_DB: join(DATA, "t.db"), GITASAARTHI_SECRET_KEY_FILE: join(DATA, "k"), GITASAARTHI_NO_BROWSER: "1" };
for (const k of ["TURSO_DATABASE_URL", "TURSO_AUTH_TOKEN", "VERCEL"]) delete env[k];
const srv = spawn("python", ["server.py"], { cwd: ROOT, env, stdio: "ignore" });

let failed = 0;
const check = (ok, msg) => { console.log(`${ok ? "PASS" : "FAIL"}  ${msg}`); if (!ok) failed++; };

try {
  for (let i = 0; i < 80; i++) { try { if ((await fetch(`${B}/healthz`)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 250)); }
  const browser = await ENGINE.launch({ headless: true });
  const ctx = await browser.newContext();
  const email = "offline@example.com", pw = "quiet river 42";
  await ctx.request.fetch(B + "/api/signup", { method: "POST", headers: { Origin: B }, data: { name: "Offline Check", email, password: pw } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(B + "/login.html");
  await page.fill("#email", email); await page.fill("#password", pw);
  await page.press("#password", "Enter");
  await page.waitForURL(/dashboard/);
  await page.goto(B + "/index.html");
  await page.waitForSelector(".chat-input-textarea");

  // Ask one message, wait for the reply to be drawn, and return the new reply row
  async function ask(text) {
    const before = await page.locator(".message-row").count();
    await page.fill(".chat-input-textarea", text);
    await page.press(".chat-input-textarea", "Enter");
    await page.waitForFunction((n) => document.querySelectorAll(".message-row").length > n + 1, before, { timeout: 15000 });
    const row = page.locator(".message-row").last();
    // replies are typed out: wait until the text stops growing
    let last = -1;
    for (let i = 0; i < 40; i++) {
      const len = (await row.innerText()).length;
      if (len === last && len > 0) break;
      last = len; await page.waitForTimeout(300);
    }
    return {
      text: (await row.innerText()).replace(/\s+/g, " ").trim(),
      pills: await row.locator(".interactive-pill-btn").count(),
      verse: await row.locator(".verse-quote").count(),
    };
  }

  const karma = await ask("what is karma?");
  check(karma.pills === 0, "karma question gets an answer, not the feeling picker");
  check(/action|result|deed|karma/i.test(karma.text), "karma answer talks about karma");

  const hi = await ask("good morning");
  check(hi.pills === 0 && hi.verse === 0, "greeting gets a short reply with no picker and no verse");

  const weather = await ask("whats the weather like");
  check(weather.pills === 0 && weather.verse === 0, "off-topic question gets a redirect with no verse and no picker");

  const verse = await ask("explain chapter 2 verse 47");
  check(verse.verse === 1 && /2\.47/.test(verse.text), `a verse request cites BG 2.47 from the library (verse blocks ${verse.verse}, drawn: "${verse.text.slice(0, 160)}")`);

  const feeling = await ask("why do I always feel so alone?");
  check(feeling.pills > 0 || /alone|lonel|company/i.test(feeling.text), "a feeling written as a question still starts the feeling flow");

  check(errors.length === 0, `no page errors (${errors.length ? errors.join("; ") : "none"})`);
  await browser.close();
} finally {
  srv.kill();
  rmSync(DATA, { recursive: true, force: true });
}
console.log(failed ? `\n${failed} check(s) failed` : "\nOffline conversation: all checks passed");
process.exit(failed ? 1 : 0);
