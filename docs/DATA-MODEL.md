# Data model

Postgres via Prisma. The **Concept is the atom**; FSRS state is embedded on it to keep the "due today" query a single indexed scan with no joins.

## Prisma schema

```prisma
// prisma/schema.prisma
generator client { provider = "prisma-client-js" }
datasource db { provider = "postgresql"; url = env("DATABASE_URL") }

model Book {
  id         String    @id @default(cuid())
  title      String
  slug       String    @unique
  sourceType SourceType
  sourceConfig Json     // adapter config, e.g. { repo, branch, srcPath, partsAllow }
  chapters   Chapter[]
  createdAt  DateTime  @default(now())
}

model Chapter {
  id         String    @id @default(cuid())
  book       Book      @relation(fields: [bookId], references: [id], onDelete: Cascade)
  bookId     String
  title      String
  order      Int
  part       String?            // e.g. "Part 1: guide"
  sourcePath String             // path within the source, e.g. "part-guide/async-await.md"
  status     ChapterStatus @default(INGESTED)
  ingestedAt DateTime  @default(now())
  // NOTE: chapter body text is NOT a column. It is held transiently during
  // extraction and discarded. Re-fetch from source if re-extraction is needed.
  concepts   Concept[]
  recalls    RecallSession[]

  @@unique([bookId, order])
}

model Concept {
  id          String   @id @default(cuid())
  chapter     Chapter  @relation(fields: [chapterId], references: [id], onDelete: Cascade)
  chapterId   String
  label       String
  detail      String              // one sentence: what understanding it requires
  weight      Int      @default(2) // 1..3 importance
  probes      Probe[]
  reviewLogs  ReviewLog[]

  // --- tier escalation ---
  currentTier Tier     @default(RECALL)

  // --- embedded FSRS card (ts-fsrs) ---
  fsrsState     FsrsState @default(NEW)
  stability     Float    @default(0)
  difficulty    Float    @default(0)
  elapsedDays   Int      @default(0)
  scheduledDays Int      @default(0)
  reps          Int      @default(0)
  lapses        Int      @default(0)
  lastReview    DateTime?
  due           DateTime?           // null until first same-day grade initializes the card

  createdAt   DateTime @default(now())

  @@index([due])                    // the "due today" query
}

model Probe {
  id             String  @id @default(cuid())
  concept        Concept @relation(fields: [conceptId], references: [id], onDelete: Cascade)
  conceptId      String
  tier           Tier
  question       String
  expectedAnswer String              // the key the Tester grades against

  @@unique([conceptId, tier])        // one canonical probe per tier per concept (v1)
}

model RecallSession {
  id         String   @id @default(cuid())
  chapter    Chapter  @relation(fields: [chapterId], references: [id], onDelete: Cascade)
  chapterId  String
  summary    String                  // user's from-memory writeup
  score      Int                     // 0..100 coverage
  result     Json                    // captured/partial/missed ids, errors, gap questions
  createdAt  DateTime @default(now())
}

model ReviewLog {
  id         String   @id @default(cuid())
  concept    Concept  @relation(fields: [conceptId], references: [id], onDelete: Cascade)
  conceptId  String
  tier       Tier
  answer     String
  rating     Int                     // 1..4 (FSRS Again/Hard/Good/Easy)
  correct    Boolean
  feedback   String?
  createdAt  DateTime @default(now())

  @@index([conceptId, createdAt])
}

enum SourceType    { MDBOOK EPUB PDF PASTE }
enum ChapterStatus { INGESTED EXTRACTED }
enum Tier          { RECALL EXPLAIN APPLY BUILD }
enum FsrsState     { NEW LEARNING REVIEW RELEARNING }
```

## Notes

- **FSRS field names mirror `ts-fsrs`'s `Card`** (`stability`, `difficulty`, `elapsed_days`, `scheduled_days`, `reps`, `lapses`, `state`, `last_review`, `due`) so mapping to/from the library is mechanical. Map snake_case ↔ camelCase in `lib/scheduling/fsrs.ts`.
- **`due` is nullable.** A concept isn't schedulable until its chapter's first recall grade initializes the card (`createEmptyCard()` then first review). Until then it shows as "not yet started" in the tracker.
- **`Probe` is one-per-tier in v1** (`@@unique([conceptId, tier])`). If you later want a bank of questions per tier, drop the unique and add a `ProbeBank`/selection strategy.
- **`expectedAnswer` is server-only.** It must never appear in a client-facing API response before the matching answer is submitted. The rubric's "sealed" state is derived from `RecallSession` existence, so no schema change is required (see ARCHITECTURE.md, "Rubric integrity & the sealed loop").
- **No chapter body column** — enforces the copyright principle at the schema level. Re-ingest to re-extract.
- The tracker's four loop cells map to: **Read** (chapter opened), **Recall** (a `RecallSession` exists), **Build** (a concept reached `BUILD` tier / manual), **Review** (concept `reps > 0` and not overdue). These are derived, not stored.
- **BYO-LLM needs no schema change.** Per-agent provider+model config lives in env/config for v1, not the database (see ARCHITECTURE.md, "LLM provider abstraction"). A `ProviderConfig` table — if config ever needs to be editable at runtime — is an optional future addition, deferred.
