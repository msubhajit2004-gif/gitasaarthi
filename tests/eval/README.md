# Offline conversation evaluation (RAGOps)

Measures how real the offline chat (`js/dialogue.js` over `js/curated_wisdom.js`) feels, before and after the
improvement work in `docs/superpowers/plans/2026-11-21-offline-conversation.md`.

Files: `scenario.json` (43 cases, schema 0.2), `run_engine.mjs` (runs the real engine, no deps, no network),
`baseline-responses.json` (the unchanged engine, the accepted baseline).

## Reproduce (run from the repo root)

```
RAGOPS="C:\Users\KIIT0001\.claude\plugins\cache\anthropic-plugin-directory\ragops\2.0.2-4b59aec3ac20\skills\evaluate-ai-release\scripts\run_ragops.py"

node tests/eval/run_engine.mjs --out tests/eval/candidate-responses.json
python "$RAGOPS" inspect  --scenario tests/eval/scenario.json
python "$RAGOPS" evaluate --scenario tests/eval/scenario.json --responses tests/eval/candidate-responses.json --format markdown
python "$RAGOPS" compare  --scenario tests/eval/scenario.json --baseline tests/eval/baseline-responses.json --candidate tests/eval/candidate-responses.json --format markdown
```

Exit code 2 from `evaluate`/`compare` is a deliberate gate failure, not an error. Add
`--evaluator retrieval_recall --evaluator citation_correctness --evaluator claim_support --evaluator answer_length_budget --evaluator abstention_contract`
(repeat the flag) to get the extra per-case metrics. The baseline file was produced by the same runner on the
untouched engine (`master` behaviour); regenerate it only on that engine.

## Case design

| Category | n | Right answer |
| --- | ---: | --- |
| feeling | 12 | Reach the matching archetype and its verse. Each case is the feeling sentence plus one neutral follow-through turn ("it has been like this for a while") so the conversation can reach phase 2; both replies are scored. Required citations = the archetype's own reference (all parts, e.g. `BG 6.26`, `BG 6.19`). |
| gita_question | 10 | Short factual answer. A verse is required only where the library has an apt one (karma 2.47, dharma 3.35, atman 2.20, yoga 2.48, bhakti 9.26, detachment 2.48, surrender 18.66, "chapter 2 verse 47"); "who is Krishna" and "what is the Gita" require NO citation. |
| smalltalk | 8 | A short warm line, no verse. |
| offtopic | 5 | Gentle redirect, no verse. Tagged `abstain`. |
| followup | 5 | Multi-turn (`context` = earlier user turns, same session); only the reply to the last turn is scored. "what does that verse mean?", "but what if I still fail?" and "tell me more" must stay on the verse already shown. |
| crisis | 3 | The Safe Harbor text, no verse. Severity `critical`, tagged `abstain`. |

Citation ids are `BG <chapter>.<verse>` (e.g. `BG 9.30-31`), taken from the library's own reference strings
(`phase2.shloka.reference`, `DAILY_SHLOKAS[].chapterVerse`). Nothing is invented. Cases carry three fields RAGOps
ignores but the runner reads: `context`, `follow_through`, `score_turns`.

Evidence for feeling cases is the archetype's own text from the library. For gita_question, smalltalk and
off-topic cases the evidence also contains short reference answers written by the author (glossary definitions,
the expected redirect line); these are the "correct answer" the lexical metrics compare against.

Thresholds: citation_coverage 1.0, citation_precision 1.0, lexical_groundedness 0.5, max_latency_ms 200,
max_cost_usd 0. Not tuned to the baseline. Citation precision 1.0 means no reference outside the required set may
appear, so a verse on an off-topic or no-citation case is a failure.

How the runner reads an engine: `renderReply(turn)` in `run_engine.mjs` is the only place that knows payload field
names. It concatenates acknowledgment/intro/message/answer/prompt/synthesis/questions/closing/step, the verse or
shloka (reference, translation, insight), CBT title and steps, clarify options and quick pills. New kinds
(`smalltalk`, `answer`, `redirect`) render through the same fields; add a field name to `TEXT_FIELDS` or
`VERSE_FIELDS` if the new engine uses another. Crisis renders the Safe Harbor text from `app.js` unless the payload
carries its own `message`.

## Accepted baseline (unchanged engine)

Decision: **FAIL, exit code 2** (RAGOps `evaluate` and `compare` report FAIL, the blocking decision).
Failed gates: `citation_coverage`, `citation_precision`, `lexical_groundedness`. Latency and cost pass; no critical
red-team findings (the red-team term list is empty).

| Metric | Baseline | Threshold |
| --- | ---: | ---: |
| citation_coverage | 0.558 | 1.0 |
| citation_precision | 0.512 | 1.0 |
| lexical_groundedness | 0.268 | 0.5 |
| abstention_contract (applicable 21% of cases) | 0.859 | n/a |
| claim_support | 0.235 | n/a |
| retrieval_recall | 0.465 | n/a |

Per category (mean per case):

| Category | coverage | precision | groundedness | Observation |
| --- | ---: | ---: | ---: | --- |
| feeling | 0.33 | 0.33 | 0.43 | 4 of 12 reach the right verse (exam, boss, empty, comparing). Grandfather, mom, sleep, salary, guilt and the three Hinglish lines fall to the fixed 4-option picker. |
| gita_question | 0.20 | 0.20 | 0.05 | No question is answered: 9 get the picker and "what does surrender mean" restarts a purpose conversation. The two no-citation cases ("who is Krishna", "what is the Gita") pass the citation gates only because nothing is cited. |
| smalltalk | 1.00 | 1.00 | 0.31 | No citation is the correct outcome, so these pass coverage trivially; only "hello" and "ok" get a real reply; "good morning", "how are you", "thank you krishna", "yes", "no" and "I got the job today!" get the picker. Low groundedness is the picker text. |
| offtopic | 1.00 | 1.00 | 0.11 | Picker for all 5 (abstention_contract 0.14): no redirect, but also no verse. |
| followup | 0.40 | 0.00 | 0.17 | "whats the weather like" and "thanks that helps" each get another verse (precision 0), "what does that verse mean?" restarts a different topic, "but what if I still fail?" restarts as anxiety. |
| crisis | 1.00 | 1.00 | 0.70 | Direct phrases route to Safe Harbor; "what is the point of living" does not (picker). |

## Comparing a future candidate

Run the runner on the improved engine, then `compare` as above. Task 6 goals from the plan: citation precision
1.0 on gita/feeling cases, off-topic abstention 100%, crisis 100%. Record the decision and per-category deltas
below, then `evidence create`/`evidence verify` the bundle (see `run_ragops.py evidence --help`).

## Contract limitations

- `abstention_contract` and `lexical_groundedness` are lexical: they measure word overlap with the evidence, not
  meaning. A good reply worded differently from the reference line scores low, so groundedness is a rough signal and
  the citation gates are the sharper ones. Offtopic and crisis abstention depends on the reference redirect wording
  in `scenario.json`.
- Citations are all-or-nothing per case: the required set must be matched exactly. Cases with more than one fitting
  verse (e.g. yoga and detachment both fit 2.48 and 2.47) had to pick one.
- RAGOps has no notion of "must be crisis-routed" or "must not cite"; both are expressed through `abstain` plus an
  empty required-citation list.
- The default `answer_length_budget` of 500 characters is exceeded by full feeling replies; it is reported but is not
  a gate.
