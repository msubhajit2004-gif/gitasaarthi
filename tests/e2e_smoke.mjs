// End-to-end smoke test for GitaSaarthi (Playwright + Chromium, headless).
//
// One-time setup (run from the project folder):
//   npm i -D playwright && npx playwright install chromium
//
// Run:  node tests/e2e_smoke.mjs      (or: python check.py --e2e)
//
// The script starts its own server on a free port with a throwaway database in the
// OS temp folder, so it never touches port 8000 or data/gitasaarthi.db. It always
// stops the server and deletes the temp database. Exit code 0 = all steps passed.

import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch (e) {
  console.error("FAIL  playwright is not installed. Run: npm i -D playwright && npx playwright install chromium");
  process.exit(1);
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const tmp = mkdtempSync(join(tmpdir(), "gitasaarthi-e2e-"));
const DB = join(tmp, "e2e.db");

function freePort(preferred = 8765) {
  return new Promise((resolve) => {
    const tryPort = (p, last) => {
      const s = createServer();
      s.once("error", () => (last ? resolve(0) : tryPort(0, true)));
      s.listen(p, "127.0.0.1", () => { const port = s.address().port; s.close(() => resolve(port)); });
    };
    tryPort(preferred, false);
  });
}

const port = await freePort();
const BASE = `http://127.0.0.1:${port}`;
let server = null, browser = null, failed = false;
const consoleErrors = [];

function cleanup() {
  try { if (server && !server.killed) server.kill(); } catch {}
  try { rmSync(tmp, { recursive: true, force: true }); } catch {}
}

async function step(name, fn) {
  if (failed) { console.log(`SKIP  ${name}`); return; }
  try { await fn(); console.log(`PASS  ${name}`); }
  catch (e) { failed = true; console.log(`FAIL  ${name} -- ${String(e.message || e).split("\n")[0]}`); }
}

function watch(page, tag) {
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const t = m.text(), u = m.location().url || "";
    if (/favicon/i.test(t + u) || /Transition was aborted/i.test(t)) return;
    consoleErrors.push(`[${tag}] ${t}`);
  });
  page.on("pageerror", (e) => {
    if (/Transition was aborted/i.test(String(e.message))) return;
    consoleErrors.push(`[${tag}] pageerror: ${e.message}`);
  });
  page.on("dialog", (d) => d.accept().catch(() => {}));
}

async function expectTrue(cond, msg) { if (!cond) throw new Error(msg); }

async function signUp(page, name, email, pw) {
  await page.goto(`${BASE}/login.html#create`);
  await page.fill("#name", name);
  await page.fill("#email", email);
  await page.fill("#password", pw);
  await page.click("#auth-submit");
  await page.waitForURL((u) => !u.pathname.endsWith("login.html"), { timeout: 15000 });
}

async function signIn(page, email, pw) {
  await page.goto(`${BASE}/login.html#signin`);
  await page.fill("#email", email);
  await page.fill("#password", pw);
  await page.click("#auth-submit");
  await page.waitForURL((u) => !u.pathname.endsWith("login.html"), { timeout: 15000 });
}

async function openApp(page) {
  await page.goto(`${BASE}/index.html`);
  await page.keyboard.press("Escape");          // skip the intro if it is showing
  await page.waitForSelector("#nav-journal-btn", { state: "visible", timeout: 15000 });
}

async function openWindowByKeyboard(page, btnId, modalId) {
  await page.focus("#" + btnId);
  await page.keyboard.press("Enter");
  await page.waitForSelector(`#${modalId}.open`, { timeout: 5000 });
  await page.keyboard.press("Escape");
  await page.waitForSelector(`#${modalId}.open`, { state: "detached", timeout: 5000 }).catch(async () => {
    await page.waitForFunction((id) => !document.getElementById(id).classList.contains("open"), modalId, { timeout: 5000 });
  });
}

const stamp = Date.now();
const A = { name: "Asha Test", email: `asha${stamp}@example.com`, pw: "First-pass-1234", pw2: "Second-pass-5678" };
const B = { name: "Bram Test", email: `bram${stamp}@example.com`, pw: "Other-pass-1234" };

try {
  server = spawn("python", ["server.py"], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), GITASAARTHI_DB: DB, GITASAARTHI_NO_BROWSER: "1" },
    stdio: "ignore",
    windowsHide: true,
  });
  let exited = false;
  server.on("exit", () => { exited = true; });

  await step("server starts and /healthz answers", async () => {
    const until = Date.now() + 20000;
    while (Date.now() < until) {
      if (exited) throw new Error("server exited early");
      try { const r = await fetch(`${BASE}/healthz`); if (r.ok) return; } catch {}
      await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error("timed out waiting for /healthz");
  });

  if (!failed) browser = await chromium.launch({ headless: true });
  const ctxA = browser ? await browser.newContext() : null;
  const page = ctxA ? await ctxA.newPage() : null;
  if (page) watch(page, "A");

  await step("sign up", async () => { await signUp(page, A.name, A.email, A.pw); });

  await step("dashboard shows greeting", async () => {
    await page.goto(`${BASE}/dashboard.html`);
    await page.waitForFunction(() => (document.getElementById("greeting")?.textContent || "").trim().length > 3, null, { timeout: 10000 });
    const g = await page.textContent("#greeting");
    await expectTrue(/good|welcome|hello/i.test(g), `unexpected greeting "${g.trim()}"`);
  });

  await step("open the app from the dashboard", async () => {
    await page.click('a[href="index.html"]');
    await page.waitForURL(/index\.html|\/$/, { timeout: 10000 });
    await page.keyboard.press("Escape");
    await page.waitForSelector("#nav-journal-btn", { state: "visible", timeout: 15000 });
  });

  for (const [label, btn, modal] of [
    ["Breathing", "nav-pranayama-btn", "pranayama-modal"],
    ["Journal", "nav-journal-btn", "journal-modal"],
    ["Verse of the day", "nav-daily-shloka-btn", "daily-shloka-modal"],
    ["Safe Harbor", "nav-safe-harbor-btn", "safe-harbor-modal"],
    ["Settings", "nav-settings-btn", "settings-modal"],
  ]) {
    await step(`${label} window opens by keyboard and closes with Escape`, () => openWindowByKeyboard(page, btn, modal));
  }

  await step("pick a feeling and get a reply", async () => {
    await page.locator(".plate-feel .compass-chip").nth(1).click();
    await page.waitForSelector(".interactive-pill-btn", { timeout: 30000 });
    await page.locator(".message-row").last().locator(".interactive-pill-btn").first().click();
    await page.waitForSelector(".cbt-title", { timeout: 30000 });
    await page.waitForSelector(".krishna-row .save-journal-btn", { timeout: 30000 });
  });

  await step("save the reply to the journal", async () => {
    await page.click(".krishna-row .save-journal-btn");
    await page.waitForFunction(() => Number(document.getElementById("journal-badge")?.textContent) >= 1, null, { timeout: 5000 });
  });

  await step("change password from Settings > Account", async () => {
    await page.click("#nav-settings-btn");
    await page.waitForSelector("#settings-modal.open");
    await page.click("#acct-pw-toggle");
    await page.fill("#acct-pw-current", A.pw);
    await page.fill("#acct-pw-new", A.pw2);
    await page.click("#acct-pw-save");
    await page.waitForFunction(() => (document.getElementById("acct-pw-msg")?.textContent || "").trim().length > 0, null, { timeout: 10000 });
    const msg = (await page.textContent("#acct-pw-msg")).trim();
    await expectTrue(!/wrong|incorrect|not |fail|could/i.test(msg), `password change message: "${msg}"`);
    await page.keyboard.press("Escape");
  });

  await step("sign out", async () => {
    await page.goto(`${BASE}/dashboard.html`);
    await page.click("#sign-out");
    await page.waitForURL((u) => !u.pathname.endsWith("dashboard.html"), { timeout: 10000 });
    const r = await page.request.get(`${BASE}/api/me`);
    await expectTrue(r.status() === 401, `/api/me returned ${r.status()} after sign out`);
  });

  await step("sign in with the new password", async () => {
    await signIn(page, A.email, A.pw2);
    await page.goto(`${BASE}/dashboard.html`);
    await page.waitForFunction(() => (document.getElementById("greeting")?.textContent || "").trim().length > 3, null, { timeout: 10000 });
  });

  await step("old password no longer works", async () => {
    const ctx = await browser.newContext();
    try {
      const r = await ctx.request.post(`${BASE}/api/login`, { data: { email: A.email, password: A.pw } });
      await expectTrue(r.status() >= 400, `old password accepted (${r.status()})`);
    } finally { await ctx.close(); }
  });

  await step("second account (fresh context) does not see the first account's journal", async () => {
    // First confirm the first account's journal really kept its entry after the round trip.
    await openApp(page);
    await page.waitForFunction(() => Number(document.getElementById("journal-badge")?.textContent) >= 1, null, { timeout: 8000 });

    const ctxB = await browser.newContext();
    try {
      const pb = await ctxB.newPage();
      watch(pb, "B");
      await signUp(pb, B.name, B.email, B.pw);
      await openApp(pb);
      await pb.focus("#nav-journal-btn");
      await pb.keyboard.press("Enter");
      await pb.waitForSelector("#journal-modal.open");
      const cards = await pb.locator(".journal-entry-card").count();
      const badge = (await pb.textContent("#journal-badge")).trim();
      await expectTrue(cards === 0 && badge === "0", `second account sees ${cards} journal entries (badge ${badge})`);
    } finally { await ctxB.close(); }
  });

  await step("delete account from Settings > Account", async () => {
    await openApp(page);
    await page.click("#nav-settings-btn");
    await page.waitForSelector("#settings-modal.open");
    await page.click("#acct-del-toggle");
    await page.fill("#acct-del-password", A.pw2);
    await page.click("#acct-del-confirm");
    await page.waitForURL((u) => !/index\.html|dashboard\.html/.test(u.pathname) || u.pathname === "/", { timeout: 15000 });
    const r = await page.request.get(`${BASE}/api/me`);
    await expectTrue(r.status() === 401, `/api/me returned ${r.status()} after delete`);
    const l = await page.request.post(`${BASE}/api/login`, { data: { email: A.email, password: A.pw2 } });
    await expectTrue(l.status() >= 400, "deleted account can still sign in");
  });

  if (browser) {
    await step("no console errors during the run", async () => {
      await expectTrue(consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" | "));
    });
  }
} catch (e) {
  failed = true;
  console.log(`FAIL  unexpected error -- ${String(e.message || e).split("\n")[0]}`);
} finally {
  try { if (browser) await browser.close(); } catch {}
  cleanup();
}

console.log(failed ? "RESULT: FAIL" : "RESULT: PASS");
process.exit(failed ? 1 : 0);
