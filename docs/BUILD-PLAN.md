# Build plan

Eight milestones, each a self-contained Claude Code session ending in something runnable. Don't let a session sprawl past its milestone.

## M0 — Scaffold (foundations)

- `create-next-app` (App Router, TS, Tailwind).
- `docker-compose.yml` with `postgres:16`; `.env` (gitignored) with `DATABASE_URL`, `ANTHROPIC_API_KEY`.
- Prisma init; paste schema from DATA-MODEL.md; `prisma migrate dev`.
- `lib/llm/`: provider port + Anthropic adapter + per-agent provider+model config (built out in M3; see ARCHITECTURE.md, "LLM provider abstraction").
- Design tokens from the prototypes (fonts, cobalt/clay) wired into Tailwind config.
- **Repo hygiene:** move these specs into `docs/`. `.gitignore` covers `.env*`, `node_modules`, `.next`, `/journal/`, `/.claude/rules/*.local.md`, and `/.claude/settings.local.json`. Set up the local-only layer from the templates: the `.claude/rules/*.local.md` rules (workflow + authoring mode), `.claude/settings.local.json` (+ `.claude/hooks/` guard) if using enforcement, and the `journal/` tree. The committed `CLAUDE.md` stays project-only so a fresh clone is clean — no dangling import to a missing file.
- **Done when:** app boots, DB migrates, a health route confirms DB + a trivial Anthropic call both work, and `git status` shows `journal/`, `.env`, `.claude/rules/*.local.md`, and `.claude/settings.local.json` untracked while `CLAUDE.md` and committed `docs/` are tracked.

## M1 — Harden the harness (before any feature work)

Agents are fast, confident, and drift. Mechanical checks that fail loud are the guardrails — an agent can talk its way past a prose principle but not past red CI. Build the check surface first, so every feature milestone below lands against green gates. The architectural lints are the high-value part; the rest is table stakes.

- **Types & lint.** TS strict (`strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`); ESLint flat config with type-aware `typescript-eslint` + `eslint-config-next`; Prettier; `eslint-plugin-unused-imports`. Optional: `knip` for dead-code/orphan-export detection (agent-generated code tends to leave orphans).
- **Architectural lints — turn the hard principles into machine checks.** `dependency-cruiser` rules, failing in CI:
  - `lib/scheduling/**` may not import `@anthropic-ai/sdk` or `lib/agents/**` — deterministic domain stays LLM-free.
  - `lib/agents/**` may not import `ts-fsrs` or `lib/scheduling/**` — agents don't schedule.
  - no `'use client'` module may import `lib/llm/**` or `lib/agents/**` — LLM stays server-side.
  - ESLint `no-restricted-syntax`: provider keys (e.g. `process.env.ANTHROPIC_API_KEY`) may appear only in `lib/llm/**` — the key can't leak into random files.
- **Env validation.** `lib/env.ts` (zod or `@t3-oss/env-nextjs`) validates required env at boot and fails loud — the classic agent-run-setup failure mode.
- **Tests.** Vitest configured; one smoke test per domain so the harness is real from day one (not retrofitted).
- **Git hooks (Husky + lint-staged).**
  - pre-commit: lint-staged → Prettier + ESLint + `prisma format` on staged files.
  - commit-msg: commitlint (Conventional Commits) — consistent agent commits, enables changelog.
  - pre-push: `tsc --noEmit` + `vitest run` + `depcruise` + `next build`.
- **CI (GitHub Actions).** On PR/push, against a `postgres:16` service container: install (cached) → typecheck → lint → depcruise → `prisma validate` → test → build. Mark these **required status checks** under branch protection so the agent's PRs can't merge red.
- **CD (intentionally thin).** No prod target for a local tool — "deploy" = build passes and `docker compose up` brings the stack up. Add a release workflow only if you ever package it.
- **Glue.** `.editorconfig`, and a `pnpm check` meta-script (`typecheck && lint && depcruise && test`) that the agent runs before declaring any milestone done.
- **Done when:** a deliberately-planted violation — importing `ts-fsrs` inside `lib/agents/` — fails `pnpm check` and CI; a non-conventional commit message is rejected; staged files are auto-formatted on commit.

## M2 — mdBook ingestion

- `SourceAdapter` interface + `mdbook-adapter.ts` (SUMMARY.md parse, part filter, include resolution, hidden-line strip).
- `POST /api/ingest` taking an `MdBookConfig`; upserts `Book` + `Chapter` rows (no bodies).
- Seed with the async-book Part-1 config.
- **Done when:** running ingest creates 1 Book + 13 Chapters; `loadChapter` returns clean markdown for a spot-checked chapter.

## M3 — Extractor + rubric storage

- Implement `lib/llm/` — the `LLMProvider` port, the **Anthropic adapter**, and the parse→validate(zod)→retry layer. The Extractor depends on the port, never a vendor SDK. Add the dependency-cruiser rule confining provider SDKs to `lib/llm/**`. (`@anthropic-ai/sdk` is installed here, imported only inside `lib/llm/`.) Building against the port is part of M3, not deferred — building the agents against a vendor SDK would force a painful retrofit.
- `lib/agents/extractor.ts` with the contract from AGENTS.md, calling the port.
- `POST /api/extract` (chapterId): load body via adapter → extract → persist `Concept` + `Probe` → set chapter `EXTRACTED` → discard body.
- Verify the rubric persisted correctly via a test or DB inspection — **no rubric-viewing UI** (deliberate: prevents casual peeking; see ARCHITECTURE.md, "Rubric integrity & the sealed loop").
- **Done when:** a chapter yields 6–10 concepts each with 4 tiered probes, persisted and verifiable via test/DB inspection (no UI). The extractor runs through the `lib/llm` port; provider SDKs and keys are confined to `lib/llm/**` (depcruise green). Re-running is idempotent (don't duplicate concepts).

## M4 — Reader + same-day Recall Grader (the core loop)

- Reader view streams chapter markdown (transient fetch, not stored).
- Recall textarea → `POST /api/recall` → `grader.ts` → persist `RecallSession`, init FSRS cards for the chapter's concepts.
- Results UI: score, captured/partial/missed, errors, gap questions (reuse the prototype layout).
- **Sealed rubric:** the rubric stays sealed until a recall is submitted; concepts, probes, and expected answers are never sent to the client pre-submit (see ARCHITECTURE.md, "Rubric integrity & the sealed loop").
- **Done when:** read → write recall → graded result renders, and concepts become schedulable (`due` set); and no concept or expected answer is retrievable before submitting a recall — verify via browser network inspection that no rubric data crosses the wire.

## M5 — Scheduling + review queue

- `lib/scheduling/fsrs.ts` (ts-fsrs wrapper; card ↔ Concept mapping).
- `GET /api/review/due` (due concepts, interleaved across books, by priority).
- Review UI: present the probe at `currentTier`; `POST /api/review/grade` → `tester.ts` → rating → FSRS update → `ReviewLog`. The review test sends only the probe **question**; the expected answer is used server-side and revealed to the client only after the answer is submitted (default), never before.
- **Done when:** a concept graded today reappears on its scheduled future date with an updated interval; the queue spans books.

## M6 — Tier escalation + tracker

- `lib/scheduling/escalation.ts` (promote `currentTier` on survival thresholds).
- Dashboard: the four-cell loop per chapter (derived Read/Recall/Build/Review), overall coverage, due count.
- **Done when:** sustained correct reviews visibly promote a concept's tier, and the tracker reflects real state.

## M7 — Multi-provider (BYO-LLM)

The port and validation layer already exist from M3; this milestone adds the second adapter and proves portability. Nothing from M3 is retrofitted.

- **OpenAI-compatible adapter** (`lib/llm/openai-compatible.ts`) with a configurable `baseURL` — one adapter covers OpenAI/Codex, Kimi (Moonshot), local Ollama/llama.cpp, and Gemini's compat endpoint.
- **Per-agent provider+model config** — a config map keyed by agent selects which provider+model each agent uses.
- **Prove portability:** run an agent against an OpenAI-compatible endpoint (e.g. local Ollama) and get valid output; swap a provider via config and the loop still works.
- **Graceful degradation** for providers without structured output (prompt + validate + retry through `lib/llm/validate.ts`).
- **Done when:** at least one agent produces valid, schema-passing output through a non-Anthropic OpenAI-compatible provider, selected via config — and the Anthropic path is unchanged.
- **Deferred:** native Gemini adapter, small-context chunking for local models, paste-your-key settings UI.

## Sequencing notes

- **M1 comes before all feature work** — the gates must exist while the agent builds, not after.
- M2→M4 is the feature spine; if time is short, a useful tool exists at the end of M4 (read + graded recall) even before scheduling.
- **The provider port + validation layer land in M3, not M7** — so the agents are built against the port from day one and nothing is retrofitted. Only the second (OpenAI-compatible) adapter and the portability proof are M7.
- The LLM/deterministic/execution boundary is enforced by the M1 depcruise rules, and the provider-SDK confinement (`lib/llm/**` only) by the rule added in M3. If CI blocks you in M5, the fix is to respect the boundary, never to weaken the rule.
- Defer always: EPUB/PDF, execution-backed code grading, auth.
