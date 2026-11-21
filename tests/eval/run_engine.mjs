// Runs tests/eval/scenario.json through the real offline engine (js/dialogue.js) and writes
// RAGOps responses: [{case_id, answer, citation_ids, latency_ms, cost_usd}].
//
//   node tests/eval/run_engine.mjs --out tests/eval/candidate-responses.json
//
// Case fields beyond the RAGOps schema (RAGOps ignores them):
//   context: [text, ...]       earlier user turns, sent first to the same session
//   follow_through: "text"     one extra user turn sent after `question` (answers Krishna's question
//                              so a feeling conversation can reach its verse)
//   score_turns: "last"|"all"  "last" scores only the reply to `question`; "all" scores every reply
//                              from `question` on (question + follow_through). Default "all".
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');
const D = require(resolve(root, 'js/dialogue.js'));
const W = require(resolve(root, 'js/curated_wisdom.js'));
const lib = { archetypes: W.WISDOM_ARCHETYPES, dailyShlokas: W.DAILY_SHLOKAS };

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const scenarioPath = resolve(opt('--scenario', resolve(here, 'scenario.json')));
const outPath = opt('--out');
if (!outPath) { console.error('usage: node tests/eval/run_engine.mjs --out <responses.json> [--scenario <file>]'); process.exit(1); }

// What app.js shows for a crisis turn (renderCrisis). Used when the engine gives no message of its own.
const CRISIS_TEXT = "I'm really glad you told me. What you are feeling matters, and you deserve help from a person right now. Please contact one of these, free and confidential, at any hour: Tele-MANAS (India): 14416 Vandrevala Foundation (India): +91 9999 666 555 USA and Canada: call or text 988 UK: Samaritans 116 123 If you are in immediate danger, call your local emergency number. Open Safe Harbor";

// ---- The ONE place that knows how a turn becomes the text a user reads -------------------------
// Reads whatever fields the payload has, so new kinds (smalltalk, answer, redirect, ...) render
// without changes elsewhere. Add a field name to a list below if a future engine invents one.
const TEXT_FIELDS = ['acknowledgment', 'intro', 'message', 'answer', 'text', 'prompt', 'synthesis', 'question1', 'question2', 'closing', 'step'];
const VERSE_FIELDS = ['verse', 'shloka'];       // objects with reference / translation / insight
function renderReply(turn) {
  const p = turn.payload || {};
  if (turn.kind === 'crisis') return p.message || CRISIS_TEXT;
  const out = [];
  const put = (v) => { if (typeof v === 'string' && v.trim()) out.push(v.trim()); };
  for (const f of TEXT_FIELDS) put(p[f]);
  if (p.vedicDiagnosis) put(`${p.vedicDiagnosis.term || ''} ${p.vedicDiagnosis.meaning || ''}`);
  for (const f of VERSE_FIELDS) {
    const v = p[f]; if (!v || typeof v !== 'object') continue;
    put(v.reference); put(v.translation); put(v.insight);
  }
  if (p.cbtPractice) { put(p.cbtPractice.title); (p.cbtPractice.steps || []).forEach(put); }
  if (Array.isArray(p.options)) p.options.forEach(o => put(o && (o.title || o.label || o)));
  if (Array.isArray(p.quickPills)) p.quickPills.forEach(put);
  return out.join(' ');
}

// "Bhagavad Gita 6.26 & 6.19", "BG 9.30-31 & 18.66", "Chapter 2, Verse 47" -> ["BG 6.26", ...]
function extractCitations(text) {
  const found = [];
  const add = (c, v) => { const id = `BG ${c}.${v.replace('–', '-')}`; if (!found.includes(id)) found.push(id); };
  const lead = /(?:Bhagavad\s+Gita|Gita|BG)\s*,?\s*((?:\d+\.\d+(?:[-–]\d+)?)(?:\s*(?:&|and|,)\s*\d+\.\d+(?:[-–]\d+)?)*)/gi;
  for (const m of text.matchAll(lead)) for (const p of m[1].matchAll(/(\d+)\.(\d+(?:[-–]\d+)?)/g)) add(p[1], p[2]);
  for (const m of text.matchAll(/Chapter\s+(\d+),?\s*Verse\s+(\d+(?:[-–]\d+)?)/gi)) add(m[1], m[2]);
  return found;
}

const scenario = JSON.parse(readFileSync(scenarioPath, 'utf8'));
const responses = [];
for (const c of scenario.cases) {
  const session = D.createSession();
  for (const t of c.context || []) D.nextTurn(session, { text: t }, lib);   // not scored
  const scored = [c.question, ...(c.follow_through ? [c.follow_through] : [])];
  const texts = []; let latency = 0;
  for (const t of scored) {
    const t0 = performance.now();
    const turn = D.nextTurn(session, { text: t }, lib);
    latency += performance.now() - t0;
    texts.push(renderReply(turn));
  }
  const keep = c.score_turns === 'last' ? [texts[0]] : texts;
  const answer = keep.join('\n\n');
  responses.push({ case_id: c.id, answer, citation_ids: extractCitations(answer), latency_ms: Math.max(1, Math.round(latency)), cost_usd: 0 });
}
writeFileSync(resolve(outPath), JSON.stringify(responses, null, 2) + '\n');
console.log(`wrote ${responses.length} responses to ${outPath}`);
