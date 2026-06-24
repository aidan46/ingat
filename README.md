# ingat

Read once, remember on schedule. A single-user, local spaced-repetition reader: it
ingests book chapters, extracts concepts into a rubric, grades your recall, and schedules
reviews with FSRS so what you read sticks.

> Status: **M0 scaffold** — foundation only. The data model, agents, scheduling, and API
> routes are not built yet. See `docs/BUILD-PLAN.md` for the milestone roadmap.

## Architecture in one breath

Three domains stay separate (enforced mechanically in later milestones):

- **LLM domain** (`lib/agents/**`, server-side only) judges language — extract, grade recall, test reviews.
- **Deterministic domain** (`lib/scheduling/**`) does FSRS + tier math. No model calls.
- **Persistence** is PostgreSQL via Prisma. Chapter bodies are transient; the rubric is the artifact.

Read `docs/` for the full picture: PROJECT, ARCHITECTURE, DATA-MODEL, AGENTS, INGESTION, BUILD-PLAN.

## Stack

Next.js (App Router, TypeScript) · PostgreSQL + Prisma · ts-fsrs · @anthropic-ai/sdk · Tailwind v4.

## Getting started

```bash
docker compose up -d        # start postgres:16
cp .env.example .env        # then fill in DATABASE_URL + ANTHROPIC_API_KEY
npx prisma migrate dev      # apply schema (empty until the data model lands)
npm run dev                 # http://localhost:3000
```

## Design tokens

- Fonts: Space Grotesk (display), Inter (body), IBM Plex Mono (mono) — via `next/font`.
- Colors: cobalt `#2347C5`, clay `#D9542B`, on a paper/ink neutral base.

Defined in `app/globals.css` (`@theme`) and wired in `app/layout.tsx`.

## Commands

```bash
docker compose up -d        # start postgres
npx prisma migrate dev      # apply schema
npx prisma studio           # inspect data
npm run dev                 # dev server
npm run build               # production build
```
