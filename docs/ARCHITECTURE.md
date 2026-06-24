# Architecture

## Stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | **Next.js (App Router), TypeScript** | One app, server + client. |
| DB | **PostgreSQL** (local via Docker) | `docker compose up` a `postgres:16` container. |
| ORM | **Prisma** | Migrations + typed client. |
| Scheduling | **ts-fsrs** | FSRS algorithm. Deterministic, no LLM. |
| LLM | **@anthropic-ai/sdk** | Server-side only. Model tiering per agent. |
| UI | **Tailwind** + the prototype design tokens | Space Grotesk / Inter / IBM Plex Mono; cobalt `#2347C5` / clay `#D9542B`. |

Single-user, local. No auth in v1.

## The three execution domains (do not blur)

```
                 ┌─────────────────────────────────────────────┐
   chapter text  │  LLM domain (server-side, @anthropic-ai/sdk) │
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

The LLM never computes a due date. The scheduler never asks a model anything. This boundary is the thing most likely to erode under "just let the agent handle it" — so it is enforced mechanically by `dependency-cruiser` rules in CI (see BUILD-PLAN.md, M1), not left to review.

## Where LLM calls live

All agent calls run in **Route Handlers** (`app/api/.../route.ts`) or **Server Actions**. The Anthropic key is read from `process.env.ANTHROPIC_API_KEY` and never serialized to the client. The client calls our own endpoints, which call Anthropic. This is the single most important deviation from the prototype.

## Request flow — the same-day loop

1. User opens a chapter in the reader (content streamed from DB, not stored permanently if copyrighted — see INGESTION.md).
2. User writes a recall and submits → `POST /api/recall`.
3. Server loads the chapter's cached rubric (no re-extraction), calls the **Recall Grader**, persists a `RecallSession`, returns the grade.
4. On first grade, each concept's FSRS card is initialized and becomes schedulable.

## Request flow — the delayed loop

1. `GET /api/review/due` → scheduler queries concepts where `due <= now`, ordered by priority, across all books (interleaved).
2. For each due concept, the **Review Tester** assembles a test from the concept's stored probes at its `currentTier` and grades the user's answer.
3. Grade → rating (1–4) → **FSRS scheduler** updates the concept's card → new `due`. A `ReviewLog` row is written. The **tier escalator** may promote `currentTier`.

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
    anthropic.ts              # SDK client + model tiering config
  prisma/
    schema.prisma
  docker-compose.yml          # postgres
  docs/                       # these files
```

## Model tiering (per your convention)

Configured in `lib/anthropic.ts`, overridable per call:

| Agent | Default | Rationale |
|---|---|---|
| Extractor | Sonnet (Opus optional for dense chapters) | One-time, cached — quality matters but cost is bounded. |
| Recall Grader | Sonnet | High volume, cheap (rubric-only context). |
| Review Tester | Sonnet | High volume, cheap. |
| Architecture Reviewer (deferred) | Opus | No ground truth; needs the strongest judgement. |
