# ingat

Read once, remember on schedule. A single-user, local spaced-repetition reader: it
ingests book chapters, extracts concepts into a rubric, grades your recall, and schedules
reviews with FSRS so what you read sticks.

> Status: **M3 extractor** — on top of ingestion, `POST /api/extract` runs the Extractor
> agent over a chapter through the `lib/llm` provider port and persists its rubric
> (Concepts + tiered Probes). Grader and scheduling are next. See `docs/BUILD-PLAN.md`
> for the milestone roadmap.

## Architecture in one breath

Three domains stay separate (enforced mechanically in later milestones):

- **LLM domain** (`lib/agents/**`, server-side only) judges language — extract, grade recall, test reviews. Agents call the `LLMProvider` port (`lib/llm/**`); provider SDKs and keys are confined there.
- **Deterministic domain** (`lib/scheduling/**`) does FSRS + tier math. No model calls.
- **Persistence** is PostgreSQL via Prisma. Chapter bodies are transient; the rubric is the artifact.

Read `docs/` for the full picture: PROJECT, ARCHITECTURE, DATA-MODEL, AGENTS, INGESTION, BUILD-PLAN.

## Stack

Next.js (App Router, TypeScript) · PostgreSQL + Prisma · ts-fsrs · @anthropic-ai/sdk · Tailwind v4.

## Getting started

```bash
docker compose up -d         # start postgres:16
cp .env.example .env         # then fill in DATABASE_URL + ANTHROPIC_API_KEY
pnpm install                 # install deps (pnpm)
pnpm exec prisma migrate dev # apply schema (also regenerates the Prisma client)
pnpm dev                     # http://localhost:3000
```

## Ingest a book

With the dev server running and the schema migrated, ingest an mdBook by POSTing its
config. This example loads Part 1 of the async-book:

```bash
curl -sS -X POST localhost:3000/api/ingest -H 'Content-Type: application/json' \
  -d '{"repo":"rust-lang/async-book","branch":"master","srcPath":"src","partsAllow":["Part 1: guide"],"resolveIncludes":true}'
# -> {"bookId":"...","chapterCount":13}
```

This creates 1 Book + 13 Chapter rows. Chapter bodies are never stored; they are fetched
transiently when needed. Re-running is idempotent: it upserts on the repo slug and each
chapter's source path, so no duplicates.

## Extract a chapter's rubric

Extraction runs the Extractor agent over one chapter and persists its rubric: 6-10
Concepts, each with four tiered Probes (RECALL / EXPLAIN / APPLY / BUILD) and an expected
answer. This makes a **real LLM call** (Anthropic, server-side via the `lib/llm` port), so
`ANTHROPIC_API_KEY` in `.env` must be a funded Console key — a `credit balance too low`
error means the key's Console account needs credits (this is separate from any Claude
subscription). Pass a `chapterId` from the ingest step:

```bash
curl -sS -X POST localhost:3000/api/extract -H 'Content-Type: application/json' \
  -d '{"chapterId":"<chapterId>"}'
# -> {"chapterId":"...","conceptCount":10}
```

The chapter flips to `EXTRACTED` and the rubric lands as `Concept` + `Probe` rows. The
rubric is **sealed**: it is never returned to the client (the response is counts only) and
there is no rubric-viewing UI — inspect it via `prisma studio` or SQL. Re-running is a
no-op once a chapter is `EXTRACTED`; pass `{"force":true}` to re-extract, which replaces
the chapter's concepts (no duplicates) rather than adding to them.

## Design tokens

- Fonts: Space Grotesk (display), Inter (body), IBM Plex Mono (mono) — via `next/font`.
- Colors: cobalt `#2347C5`, clay `#D9542B`, on a paper/ink neutral base.

Defined in `app/globals.css` (`@theme`) and wired in `app/layout.tsx`.

## Commands

```bash
docker compose up -d         # start postgres
pnpm exec prisma migrate dev # apply schema
pnpm exec prisma studio      # inspect data
pnpm dev                     # dev server
pnpm build                   # production build
```
