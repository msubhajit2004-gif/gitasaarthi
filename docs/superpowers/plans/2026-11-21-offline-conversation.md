# Offline Conversation That Feels Real — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When Gemini is off or failing, the offline engine (the "RAG" over the curated Gita library) answers greetings, general and Gita questions, and ongoing conversation sensibly instead of forcing every message into a feeling and a verse; plus 30+ demo users on the admin panel.

**Architecture:** A new pure module `js/understand.js` decides what a message is (intent) and retrieves the best matching feeling with a TF-IDF index over the library plus a synonym map; `js/gita_knowledge.js` answers Gita questions from a small glossary and the library's own verses, always citing a real reference. `js/dialogue.js` routes through them before its existing feeling flow. Quality is measured with RAGOps (scenario + responses, accepted baseline = today's engine) and pinned with node tests.

**Tech Stack:** Plain browser JS (UMD, Node-testable), node:test, Python stdlib server (unchanged except demo seeding), RAGOps CLI (`run_ragops.py`) for release evidence.

**Spec:** the user's request of 2026-11-21 (this conversation) plus the findings in "Root causes" below.

## Root causes (reproduced on `master`, `$TEMP/gs-probe*.js`)
1. Feeling match is exact keyword stems only: "I miss my grandfather", "I had a fight with my mom", "I can't sleep", "I feel nothing", "I am happy today" all fall to `clarify`.
2. No route for Gita/general questions, greetings, thanks, yes/no/filler, good news or off-topic: they get the same 4-option picker (burnout, anxiety, fear, heartbreak) every time.
3. After phase 2 every message becomes `followup` with another verse: "what's the weather like" gets an anxiety verse.
4. With Gemini failing, each reply shows the fallback note, so the conversation visibly changes voice.

## Global Constraints
- Work only on branch `feature/offline-conversation`; nothing is pushed to `master` or deployed to Vercel until the user has checked it locally and says so.
- No new runtime dependency; browser files stay plain JS loaded by `<script>` (UMD, `module.exports` for tests); no network in tests.
- Crisis detection keeps absolute priority (existing tests stay green; 100% of crisis cases routed to crisis).
- Never invent a verse: every cited reference must exist in `js/curated_wisdom.js` (WISDOM_ARCHETYPES phase2 shloka or DAILY_SHLOKAS).
- Copy follows DESIGN.md voice: plain, warm, no cheering, no "Pranama" in non-feeling replies, no emoji.
- Demo users use reserved `@example.org` addresses (never real-looking gmail addresses of real people) and are removable in one command; live seeding only after the local check and the user's go-ahead.

## Review Focus
1. A feeling written in a question form ("why do I always feel so alone?") must still reach the feeling flow, not the Gita-answer flow — test in Task 2.
2. A Gita question mid-conversation ("what does that verse mean?") must explain the verse just shown, not start a new topic — test in Task 3.
3. Mixed messages with a crisis term inside a question ("what is the point of living") must route to crisis — test in Task 2.
4. Very short replies after Krishna's questions ("yes", "a bit", "no") must continue the current conversation, not reset it — test in Task 2.
5. Hindi/Hinglish words common in India ("tension", "pareshan", "dukh", "akela") should map to feelings — test in Task 1.

---

### Task 0: Baseline evaluation (RAGOps) on the current engine

**Files:** Create `tests/eval/scenario.json`, `tests/eval/run_engine.mjs`, `tests/eval/baseline-responses.json`, `tests/eval/README.md`.

**Interfaces:** Produces `node tests/eval/run_engine.mjs --out <file>` → RAGOps responses JSON `[{case_id, answer, citation_ids, latency_ms, cost_usd}]`; citation ids are verse references normalised as `BG <chapter>.<verse>` exactly as in the library.

- [ ] Write ≥40 cases in RAGOps schema 0.2 (fields as in the RAGOps demo scenario: id, question, evidence, required_citation_ids, category, severity, language "en"), categories: `feeling` (12, incl. paraphrases from Root cause 1 and Hinglish), `gita_question` (10: karma, dharma, who is Krishna, what is the Gita, 2.47, atman, yoga, bhakti, detachment, surrender), `smalltalk` (8: greetings, thanks, how are you, yes/no/filler, good news), `offtopic` (5: weather, joke, cricket score, maths, coding), `followup` (5: multi-turn inputs, encoded as `question` with a `context` prefix the runner understands), `crisis` (3).
- [ ] Confirm the abstention field name with `python scripts/run_ragops.py contract --help` / `inspect`; off-topic cases expect abstention (no citations).
- [ ] Runner: loads the engine, runs each case through `Dialogue.nextTurn` (multi-turn when `context` is given), renders the reply text the user would see, extracts cited references.
- [ ] Run it on the unchanged engine → `baseline-responses.json`; run `run_ragops.py evaluate --scenario ... --responses baseline-responses.json --format markdown` and save the summary in `tests/eval/README.md` as the accepted baseline (expected: BLOCK on many cases).
- [ ] Commit: `test(eval): RAGOps scenario and baseline for the offline engine`.

### Task 1: Retrieval that understands paraphrases (`js/understand.js`)

**Files:** Create `js/understand.js`, `tests/understand.test.js`; modify `js/dialogue.js` (`matchArchetype` delegates).

**Interfaces:** Produces `Understand.buildIndex(archetypes) -> Index`, `Understand.rank(text, index) -> [{id, score}]` (sorted, scores 0..1), `Understand.SYNONYMS` (word → archetype ids).

- [ ] Failing tests: "I miss my grandfather" → `grief` first; "I had a fight with my mom" → `anger` or `heartbreak` in top 2; "I can't sleep at night thinking" → `anxiety`/`overthinking` top 2; "I feel nothing, empty" → `depression`; "my salary is not enough" → `financial`; Hinglish: "bahut tension hai", "pareshan hoon" → `anxiety`, "akela feel karta hoon" → `loneliness`, "dukh" → `grief`/`depression`; unrelated text ("whats the weather") → top score < `Understand.MIN_SCORE`.
- [ ] Implement TF-IDF over each archetype's keywords + phase1/phase2 text + verse translation/commentary, with a curated synonym map expanding the query (family words, sleep, numb/empty, money, exam, Hinglish), light stemming; `MIN_SCORE = 0.12` and a margin rule for ambiguity.
- [ ] `matchArchetype` keeps its return shape `{archetype, score, ranked}` using `rank`; existing dialogue tests stay green.
- [ ] Commit: `feat(engine): TF-IDF + synonym retrieval for feelings`.

### Task 2: Intent routing (`js/understand.js` + `js/dialogue.js`)

**Interfaces:** Produces `Understand.intent(text, session) -> {type, detail}` with `type` ∈ `crisis|aside|greeting|gratitude|affirm|deny|filler|good_news|gita_question|verse_question|offtopic|feeling|unclear`.

- [ ] Failing tests (one per type) including Review Focus 1, 3, 4: "why do I always feel so alone?" → `feeling`; "what is the point of living" → `crisis`; after phase 1, "yes"/"a bit" → continue (phase 2), not reset; "thank you krishna" → `gratitude`; "good morning"/"how are you" → `greeting`; "I got the job!" → `good_news`; "tell me a joke"/"whats 2+2"/"cricket score" → `offtopic`.
- [ ] `nextTurn` order: crisis → aside → intent router → existing feeling flow; new turn kinds `smalltalk`, `answer`, `redirect` with payload `{message, verse?}`; after phase 2, only `feeling`/`unclear`-with-feeling go to `followup`; offtopic never gets a verse.
- [ ] `clarify` options come from the top-3 `rank` results (not a fixed list) and its prompt varies.
- [ ] Commit: `feat(engine): intent routing for small talk, questions, good news and off-topic`.

### Task 3: Gita answers with real citations (`js/gita_knowledge.js`)

**Interfaces:** Produces `GitaKnowledge.answer(text, lib, session) -> {message, verse: {reference, sanskrit, translation}|null} | null`; `GitaKnowledge.findVerse(ref, lib)` for "2.47", "chapter 2 verse 47", "BG 2.47".

- [ ] Failing tests: "what is karma?" cites a library verse about action without attachment if present (else none) and explains karma in ≤3 sentences; "explain chapter 2 verse 47" returns that verse when it is in the library and says plainly when it is not; "who is Krishna?"/"what is the Bhagavad Gita?" give factual answers with no invented verse; Review Focus 2: after phase 2, "what does that verse mean?" explains `session.lastVerse` (its commentary).
- [ ] Glossary entries (karma, dharma, atman, yoga, bhakti, jnana, moksha, maya, gunas, Krishna, Arjuna, Kurukshetra, the Gita, detachment, surrender) as short factual text; verse lookup only over the library.
- [ ] Commit: `feat(engine): answer Gita questions from the library with citations`.

### Task 4: Show the new replies (`js/app.js`) and use Gemini for them when it works

- [ ] Render `smalltalk`/`redirect` as a short Krishna line; `answer` as text plus the cited verse block (reuse the existing verse markup); no journal save button on smalltalk/redirect.
- [ ] When Gemini is on, `answer`/`smalltalk` go to Gemini with a short-answer prompt (`GeminiService.generateAnswer(text, history) -> {answer}`), falling back to the offline reply.
- [ ] Commit: `feat(app): render offline answers and small talk`.

### Task 5: Failing Gemini does not break the voice

- [ ] After a Gemini failure, skip Gemini for 5 minutes (circuit breaker in `GeminiService`), so replies are not slowed by repeated failures.
- [ ] Show the fallback note once per page, quietly ("Gemini is unavailable right now; answering from the offline library."), not on every reply.
- [ ] Tests (node, vm sandbox like `tests/gemini_retry.test.js`): failure opens the breaker; success closes it; note flag set once.
- [ ] Commit: `fix(gemini): back off after failures and keep one quiet note`.

### Task 6: Release evidence (RAGOps)

- [ ] Run the runner on the branch → `tests/eval/candidate-responses.json`; `run_ragops.py evaluate` and `compare` against the baseline; thresholds: citation precision 1.0 on gita/feeling cases (no invented references), off-topic abstention 100%, crisis 100%; record PASS/BLOCK and per-category deltas in `tests/eval/README.md`; `evidence verify` the bundle.
- [ ] `python check.py --e2e` green (plus the new node tests); e2e smoke gains a step: offline small talk and a Gita question with Gemini off.

### Task 7: Demo users for the admin panel

- [ ] `scripts/seed_demo_users.py --target local|live [--count 35] [--dry-run] [--remove]`: users `firstname.lastname@example.org` (Indian names), realistic activity like `scripts/demo.py`; `--target live` requires `--yes-write-production` and Turso env; `--remove` deletes exactly `%@example.org` accounts. Tests on a temp SQLite DB.
- [ ] Run on local; run on live only after the user's go-ahead (Task 8).

### Task 8: Local check, then the user decides

- [ ] Start `python server.py` on the branch; user checks the chat offline (Gemini off) and with Gemini on; user checks the admin panel with demo users (local).
- [ ] Only on the user's word: merge to `master`, push (Vercel deploys), seed live demo users, run live e2e, clean test accounts.
