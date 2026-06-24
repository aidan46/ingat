# CLAUDE.md

Conventions for Claude Code working in this repo. Read `docs/` before building: PROJECT, ARCHITECTURE, DATA-MODEL, AGENTS, INGESTION, BUILD-PLAN.

## Non-negotiable principles

1. **Three domains stay separate.** LLMs judge language; deterministic code (`lib/scheduling/*`) does FSRS + tier math; execution grades code (deferred). Never call a model to compute a schedule or a score that arithmetic can produce.
2. **LLM calls are server-side only.** Anthropic key from `process.env.ANTHROPIC_API_KEY`, never sent to the client. Client calls our own route handlers.
3. **The grader never sees what it's grading against and the answer at once.** Extractor sees chapter, not answers. Graders see the rubric, not the chapter.
4. **No long-term storage of copyrighted chapter text.** Bodies are transient; the rubric is the artifact. The schema has no chapter-body column — keep it that way.
5. **Agents return only JSON.** Parse defensively (strip ```fences, slice first`{`…last `}`).
6. **Rubric integrity.** The rubric (concepts, probes, expected answers) is never exposed before it's earned: it stays server-side, is never serialized into any client response prior to the matching answer being submitted, and has **no viewer UI**. The loop is state-machined so answers can't be reached early. This is enforced by structure and discipline, **not encryption** — the app holds the key, so encryption would add friction without security. Deliberate non-goal.

## Stack

Next.js (App Router, TS) · PostgreSQL + Prisma · ts-fsrs · @anthropic-ai/sdk · Tailwind.
Local single-user, no auth.

## Local workflow layer

Personal, machine-local workflow — the session ritual, build-time auth, and the **authoring mode** (which parts of the codebase the human writes by hand vs delegates) — is layered in via **gitignored `.claude/rules/*.local.md`** files, which Claude Code auto-loads by presence but which are never committed. Personal Claude Code settings (permission/deny rules, hooks) live in gitignored `.claude/settings.local.json`. This `CLAUDE.md` stays project-only so a fresh clone is clean and unconstrained. Don't add personal-workflow or local-path instructions here; they belong in the local layer.

## Model tiering

Set defaults in `lib/anthropic.ts`; pass `model` per call, don't hardcode at call sites.

- Extractor: Sonnet (Opus allowed for dense chapters)
- Recall Grader / Review Tester: Sonnet
- Architecture Reviewer (deferred): Opus

## Mechanical gates (run before declaring anything done)

- `pnpm check` (typecheck + lint + depcruise + test) must be green before any commit or PR. A milestone is not done on a red check — see BUILD-PLAN.md "Done when".
- The three-domain boundary is enforced by `dependency-cruiser`, not good intentions. If a depcruise rule blocks you, the fix is to **respect the boundary** — never weaken or disable the rule.
- `process.env.ANTHROPIC_API_KEY` is referenced only in `lib/anthropic.ts` (ESLint-enforced). Don't reach for it elsewhere.
- Server-only modules (`lib/anthropic.ts`, `lib/agents/**`) must start with `import "server-only";` so a `'use client'` component importing them fails the build. This is the client→server boundary (the LLM stays server-side); enforced by the `server-only` package, not depcruise.
- Conventional Commits are enforced by commitlint; Husky runs hooks on commit and push. Don't bypass with `--no-verify`.

## Commands

```bash
docker compose up -d        # start postgres
pnpm install                # install deps (pnpm; see packageManager field)
pnpm exec prisma migrate dev # apply schema
pnpm exec prisma studio     # inspect data
pnpm dev                    # next dev server
pnpm check                  # typecheck + lint + depcruise + test (gate)
```

## Conventions

- Ingestion adapters implement `SourceAdapter`. Add adapters under `lib/ingestion/`; never special-case a source outside an adapter.
- Idempotent ingestion/extraction: re-running must not duplicate Chapters or Concepts (upsert on natural keys).
- Keep FSRS field names aligned with `ts-fsrs`'s `Card`; do snake/camel mapping in one place (`lib/scheduling/fsrs.ts`).
- Work milestone by milestone (BUILD-PLAN.md). Each milestone ends runnable; don't pull later-milestone work forward.
- Prefer Server Actions / Route Handlers for agent calls; stream the reader content rather than persisting it.
- Keep `README.md` current as features land. When a milestone changes what the app does or how to run it, update the README in the same change — it's the front door for a fresh clone.

## Definition of done per milestone

See BUILD-PLAN.md — each has an explicit "Done when". Don't mark a milestone complete until its check passes against a real run, not a mock.
