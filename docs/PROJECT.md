# ingat — project brief

> Named **ingat** — Indonesian/Malay for *remember*. Sits alongside `ilmu` (the studio) and `arus` (the trading system) as one body of work, and keeps the project name clear of `recall`, which is reserved throughout the code for the same-day recall mechanic.

## What it is

A local-first tool for giving yourself a CS education from digital books. You read a chapter, write what you remember from memory, and an AI grades your retention against a concept key it extracted from the chapter *before* it saw your summary. Concepts you learn become individually scheduled spaced-repetition items that get re-tested days and weeks later at escalating difficulty.

It is the union of two things we prototyped: the four-stage mastery tracker (Read → Recall → Build → Review) and the rubric-first retention grader.

## The one idea everything hangs off

**The concept is the atom.** A chapter is just where concepts are born. Every concept carries its own probes (questions + expected answers at four difficulty tiers) and its own FSRS schedule. The reader, the same-day grader, the delayed tests, and the tracker UI are all just *views* over a pile of concepts.

## The four-tier test ladder

A concept's test type escalates only as it proves it will stick — you never pay the cost of a hard test on a concept you haven't retained:

1. **RECALL** — what is X, why does it exist
2. **EXPLAIN** — X vs Y, when does X break
3. **APPLY** — trace X on a new example
4. **BUILD** — implement it / sketch the architecture

BUILD is conceptual-only graded by the LLM in v1 (architecture sketches). Execution-backed code grading is explicitly deferred (see AGENTS.md).

## Hard design principles

1. **LLMs judge language. Deterministic code does scheduling and math. Execution grades code.** Never blur these. FSRS is arithmetic, not a prompt.
2. **The grader never sets and marks the same test.** Rubric extraction happens without sight of the user's answer, always.
3. **Don't store copyrighted source text long-term.** The rubric is the durable artifact; chapter text is transient, held only during extraction.
4. **All LLM calls are server-side.** Keys live in env, never reach the client. (The artifact prototype called the API from the browser only because of the sandbox — that does not carry over.)

## v1 scope (what "done" means for the first build)

- Ingest **Part 1** of the Rust async book via an mdBook adapter.
- Extract a rubric (concepts + tiered probes) per chapter, cached.
- Read a chapter, write a recall, get a same-day grade with misses, errors, and gap questions.
- Concepts become FSRS-scheduled; a "due today" review queue tests them and updates schedules.
- A tracker view showing each chapter's loop progress.

## Explicit non-goals for v1

- No EPUB/PDF ingestion (adapter interface is designed for it; not implemented).
- No execution-backed code grading.
- No auth / multi-user / cloud sync. Single local user.
- No mobile. Local web UI only.
