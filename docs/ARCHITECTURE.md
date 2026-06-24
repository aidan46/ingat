# Architecture

## Stack

| Layer      | Choice                                                                  | Notes                                                                     |
| ---------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Framework  | **Next.js (App Router), TypeScript**                                    | One app, server + client.                                                 |
| DB         | **PostgreSQL** (local via Docker)                                       | `docker compose up` a `postgres:16` container.                            |
| ORM        | **Prisma**                                                              | Migrations + typed client.                                                |
| Scheduling | **ts-fsrs**                                                             | FSRS algorithm. Deterministic, no LLM.                                    |
| LLM        | **provider port (`lib/llm`) + adapters (anthropic, openai-compatible)** | Server-side only. Per-agent provider+model. SDKs and keys confined here.  |
| UI         | **Tailwind** + the prototype design tokens                              | Space Grotesk / Inter / IBM Plex Mono; cobalt `#2347C5` / clay `#D9542B`. |

Single-user, local. No auth in v1.

## The three execution domains (do not blur)

```
                 ┌─────────────────────────────────────────────┐
   chapter text  │  LLM domain (server-side, via `lib/llm` port)│
   ───────────▶  │   Extractor · Recall Grader · Review Tester  │
                 └───────────────┬─────────────────────────────┘
                                 │ structured JSON (concepts, grades, ratings)
                                 ▼
                 ┌─────────────────────────────────────────────┐
   ratings 1–4   │  Deterministic domain (plain TS)            │
   ───────────▶  │   FSRS scheduler · tier escalator          │
                 └───────────────┬─────────────────────────────┘
                                 │ due dates, tiers, schedules
                                 ▼
                 ┌─────────────────────────────────────────────┐
                 │  Postgres (Prisma)                          │
                 └─────────────────────────────────────────────┘

   ( Execution domain — compile+test grading — deferred to post-v1 )
```

The LLM never computes a due date. The scheduler never asks a model anything. This boundary is the thing most likely to erode under "just let the agent handle it" — so it is enforced mechanically by `dependency-cruiser` rules in CI (see BUILD-PLAN.md, M1), not left to review. A further rule confines provider SDKs: only `lib/llm/**` may import a vendor SDK; `lib/agents/**` imports the `LLMProvider` port, never an SDK.

## Where LLM calls live

All agent calls run in **Route Handlers** (`app/api/.../route.ts`) or **Server Actions**, and go through the `lib/llm` provider port. Provider keys (e.g. `process.env.ANTHROPIC_API_KEY`, any OpenAI-compatible key) are read only inside `lib/llm/**` and never serialized to the client. The client calls our own endpoints, which call the provider. This is the single most important deviation from the prototype.

## LLM provider abstraction

ingat is bring-your-own-key: any LLM, not a single vendor. Agents depend on an `LLMProvider` **port**, never a vendor SDK. "Any LLM" collapses to ~2 adapters because the OpenAI Chat Completions format is the de facto standard — Codex/OpenAI, Kimi (Moonshot), and local runtimes (Ollama/llama.cpp) all speak it, and Gemini offers an OpenAI-compatible endpoint. So a native **Anthropic** adapter plus one **OpenAI-compatible** adapter (configurable `baseURL`) covers nearly the whole list; native Gemini is deferred.

The hard part is structured output, not plumbing: Anthropic forces JSON via tool-use, OpenAI has native structured outputs, local models often have none. The real investment is therefore a **parse → validate (zod) → retry** layer (`lib/llm/validate.ts`), with structured output exposed as a capability that **degrades gracefully**.

```ts
interface LLMProvider {
  name: string;
  supportsStructuredOutput: boolean;
  // messages in, schema-validated JSON out (retries on invalid output)
  complete<T>(args: {
    system?: string;
    messages: Msg[];
    schema: ZodSchema<T>;
    model: string;
    maxTokens?: number;
  }): Promise<T>;
}
```

- **Anthropic adapter** (`lib/llm/anthropic.ts`) uses tool-use to force JSON.
- **OpenAI-compatible adapter** (`lib/llm/openai-compatible.ts`) takes a configurable `baseURL` (covers Codex/Kimi/Ollama/Gemini-compat) and uses native structured outputs when available, else prompt + validate + retry.
- **Per-agent provider+model config** — a config map keyed by agent — generalizes model tiering: a strong model extracts (cached), a cheap or local model grades.

## Request flow — the same-day loop

1. User opens a chapter in the reader (content streamed from DB, not stored permanently if copyrighted — see INGESTION.md).
2. User writes a recall and submits → `POST /api/recall`.
3. Server loads the chapter's cached rubric (no re-extraction), calls the **Recall Grader**, persists a `RecallSession`, returns the grade.
4. On first grade, each concept's FSRS card is initialized and becomes schedulable.

## Request flow — the delayed loop

1. `GET /api/review/due` → scheduler queries concepts where `due <= now`, ordered by priority, across all books (interleaved).
2. For each due concept, the **Review Tester** assembles a test from the concept's stored probes at its `currentTier` and grades the user's answer.
3. Grade → rating (1–4) → **FSRS scheduler** updates the concept's card → new `due`. A `ReviewLog` row is written. The **tier escalator** may promote `currentTier`.

## Rubric integrity & the sealed loop

The threat model here is **self-discipline, not a remote attacker** — "cheating" is peeking at the answer key early. Encryption is rejected on purpose: the app must decrypt the rubric to grade, so the key is always local, and crypto would add friction without buying security. Integrity is structural instead, from three rules:

- A chapter's rubric is **sealed** until the user submits a recall for that chapter. The sealed state is **derived** — no `RecallSession` for the chapter ⇒ sealed — so there is **no new column**.
- The only data that crosses the wire to the client is **chapter text** (to read) and **grade results** (after submit). Concepts, probes, and expected answers **never** leave the server.
- **Same-day loop:** the rubric is used only inside the server-side grade call. The client receives the result (score, captured/partial/missed _labels_, errors, gap questions) — never the probes or expected answers.
- **Delayed review loop:** the test presents only the probe **question** at the current tier. The expected answer is used server-side to grade and is revealed to the client **only after the user submits their answer** (the documented, configurable default: reveal-after-answer), or withheld entirely (score + feedback only).
- There is **no rubric-viewing UI** anywhere in the app.

## Suggested directory layout

```
ingat/
  app/
    page.tsx                  # dashboard / tracker
    books/[slug]/...          # reader + recall entry
    review/                   # due-today queue
    api/
      ingest/route.ts         # trigger mdBook ingestion
      extract/route.ts        # run Extractor on a chapter
      recall/route.ts         # same-day grade
      review/due/route.ts     # due concepts
      review/grade/route.ts   # grade a review answer
  lib/
    agents/                   # extractor.ts, grader.ts, tester.ts (LLM domain)
    scheduling/               # fsrs.ts, escalation.ts (deterministic domain)
    ingestion/                # source-adapter.ts, mdbook-adapter.ts
    llm/                      # provider port + adapters (LLM domain)
      index.ts                #   the LLMProvider port + per-agent provider+model config
      anthropic.ts            #   Anthropic adapter (tool-use for JSON)
      openai-compatible.ts    #   OpenAI-compatible adapter (configurable baseURL)
      validate.ts             #   parse / validate (zod) / retry
  prisma/
    schema.prisma
  docker-compose.yml          # postgres
  docs/                       # these files
```

## Model tiering (per your convention)

Per-agent **provider + model**, configured in `lib/llm/` and overridable per call. The recommended config pairs a strong model on the cached, one-time Extraction with a cheap or local model on the constant Grading. Caveat to state plainly: **grading quality _is_ the pedagogy** — a weak grader undermines the retention loop — so use a capable model for extraction at minimum.

| Agent                            | Default provider+model                             | Rationale                                               |
| -------------------------------- | -------------------------------------------------- | ------------------------------------------------------- |
| Extractor                        | Anthropic · Sonnet (Opus optional, dense chapters) | One-time, cached — quality matters but cost is bounded. |
| Recall Grader                    | Sonnet (cheap or local provider acceptable)        | High volume, cheap (rubric-only context).               |
| Review Tester                    | Sonnet (cheap or local provider acceptable)        | High volume, cheap.                                     |
| Architecture Reviewer (deferred) | Anthropic · Opus                                   | No ground truth; needs the strongest judgement.         |
