# Agents

Three LLM agents. Each has a strict I/O contract and returns **only** JSON. Two things people wrongly make agents are listed at the end — they are plain code.

General rules:

- Server-side only (`lib/agents/*`), key from env.
- Use the SDK's structured output discipline: system prompt demands minified JSON, no markdown; parse defensively (strip fences, slice first `{` to last `}`).
- Pass `model` in from the tiering config; don't hardcode.

---

## 1. Extractor

**When:** once per chapter, on ingestion. Cached forever (re-run only on re-ingest).
**Sees:** chapter text. **Never sees:** any user answer.

**Input:** `{ chapterTitle, chapterMarkdown }`
**Output:**

```json
{
  "concepts": [
    {
      "label": "The async runtime",
      "detail": "Why Rust ships no runtime and what a runtime is responsible for.",
      "weight": 3,
      "probes": [
        { "tier": "RECALL", "question": "...", "expectedAnswer": "..." },
        { "tier": "EXPLAIN", "question": "...", "expectedAnswer": "..." },
        { "tier": "APPLY", "question": "...", "expectedAnswer": "..." },
        { "tier": "BUILD", "question": "...", "expectedAnswer": "..." }
      ]
    }
  ]
}
```

**Prompt sketch:**

> You are building a durable answer key for spaced retention testing of a textbook chapter. Extract the 6–10 most important concepts a reader must retain. For each concept give a short `label`, a one-sentence `detail` of what understanding it requires, an integer `weight` 1–3 (3 = load-bearing), and exactly four `probes`, one per tier:
>
> - RECALL: what it is / why it exists
> - EXPLAIN: contrast or boundary — when it breaks, how it differs from a sibling concept
> - APPLY: trace or use it on a new, concrete example not from the chapter
> - BUILD: implement it or sketch the architecture (a design/coding task)
>   Each probe has a `question` and a concise `expectedAnswer` that a grader can mark against. Base everything strictly on the chapter; invent nothing. Output ONLY minified JSON matching the schema. No markdown.

This is the expensive call. Generating all four tiers up front is deliberate: the delayed tests then need neither the chapter text (copyright) nor a second extraction (cost).

---

## 2. Recall Grader

**When:** same-day, when the user submits a from-memory summary.
**Sees:** the rubric + the user's summary. **Never sees:** the chapter text (forces grading against the key, not the prose).

**Input:** `{ concepts: [{id,label,detail,weight}], summary }`
**Output:**

```json
{
  "score": 0,
  "verdict": "one blunt sentence",
  "captured": ["conceptId"],
  "partial": ["conceptId"],
  "missed": ["conceptId"],
  "errors": [{ "claim": "...", "correction": "..." }],
  "questions": ["gap-targeting question", "..."]
}
```

**Prompt sketch:**

> Grade a reader's from-memory summary against a fixed answer key. Be exacting, not generous. Mark each concept captured / partial / missed. List confidently-stated incorrect claims as `errors` with corrections. Compute `score` 0–100 = weight-adjusted fraction captured (partial = half). Write 2–3 probing `questions` aimed at the most important missed/partial concepts. Output ONLY minified JSON. No markdown.

---

## 3. Review Tester

**When:** a concept is due (from the scheduler's queue).
**Sees:** the concept's stored probe at its `currentTier`, plus the user's answer. **Never sees:** the chapter text.

**Input:** `{ probe: {tier, question, expectedAnswer}, answer }`
**Output:**

```json
{
  "correct": true,
  "rating": 3,
  "feedback": "what was missing or wrong, one or two sentences"
}
```

- `rating` is FSRS 1–4 (Again/Hard/Good/Easy). Map quality → rating; this is the **only** number the scheduler consumes.
- For `BUILD`-tier probes in v1 the answer is an architecture sketch / pseudocode and is graded by judgement here. Real code execution is deferred (below).

**Prompt sketch:**

> Grade the answer against the expected answer for a {tier}-tier question. Decide `correct` (did they demonstrate the required understanding) and a `rating` 1–4: 1 wrong/blank, 2 right but shaky, 3 solid, 4 fluent and complete. Give one or two sentences of `feedback` naming the specific gap. Output ONLY minified JSON.

---

## Deliberately NOT agents

- **FSRS scheduler** (`lib/scheduling/fsrs.ts`) — takes a concept's card + a rating, returns the next card via `ts-fsrs`. Pure arithmetic. A model must never touch this.
- **Tier escalator** (`lib/scheduling/escalation.ts`) — rule-based promotion of `currentTier` when survival thresholds are met (e.g. promote after 2 ratings ≥ 3 at the current tier, or when `stability` crosses a per-tier threshold). Config-driven constants, not a prompt.

## Deferred (post-v1): execution-backed code grader

For real `BUILD` grading of Rust/code answers, an LLM opinion is the wrong signal — the signal is "does it compile and pass tests." That wants a sandboxed runner (compile + run a hidden test), with LLM review reserved only for architecture sketches where there is no ground truth. Heavier, separate component. Named here so it doesn't sneak in as "just another tester mode."
