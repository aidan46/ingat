import { prisma } from "@/lib/db";

// Tracker (server component): progress derived from existing rows, NO new storage.
// Sealed: aggregates only. NEVER select Probe (question/expectedAnswer); do not
// render concept label/detail (rubric content). Counts/tiers/booleans are progress
// metadata, not the answer key - those are fine.

// One chapter's four-cell loop, all DERIVED. Cells are phases, not tiers:
// Read/Recall/Review = activities, Build = reached top rung.
type ChapterProgress = {
  title: string;
  read: boolean; // proxy: status EXTRACTED (no read-tracking table; rubric exists = processed)
  recall: boolean; // RecallSession exists (same-day recall done)
  build: boolean; // some concept hit BUILD tier (.some = in-progress mastery, not .every)
  review: boolean; // some concept has a ReviewLog (delayed review happened)
};

export default async function Tracker() {
  const now = new Date();

  // Sealed select: title/status/tier/due/counts only, no Probe or label/detail.
  // Counts sit at different levels by design: recalls per-chapter (RecallSession
  // -> Chapter), reviewLogs per-concept (ReviewLog -> Concept).
  const books = await prisma.book.findMany({
    select: {
      title: true,
      chapters: {
        select: {
          title: true,
          status: true,
          concepts: {
            select: {
              currentTier: true,
              due: true,
              _count: { select: { reviewLogs: true } },
            },
          },
          _count: { select: { recalls: true } },
        },
      },
    },
  });

  // Grouped per book (render loops books, then chapters).
  const chapterProgress: { bookTitle: string; chapters: ChapterProgress[] }[] =
    books.map((book) => {
      return {
        bookTitle: book.title,
        chapters: book.chapters.map((chapter) => {
          return {
            title: chapter.title,
            read: chapter.status === "EXTRACTED",
            recall: chapter._count.recalls > 0,
            build: chapter.concepts.some(
              (concept) => concept.currentTier === "BUILD",
            ),
            review: chapter.concepts.some(
              (concept) => concept._count.reviewLogs > 0,
            ),
          };
        }),
      };
    });

  // Cross-book summary (no book scoping, mirrors /due). coverage = scheduled/total
  // concepts (moves as you study, not just ingest). Zero-guard avoids 0/0 NaN.
  const allConcepts = books.flatMap((b) =>
    b.chapters.flatMap((c) => c.concepts),
  );
  const dueCount = allConcepts.filter(
    (c) => c.due !== null && c.due <= now,
  ).length;
  const scheduled = allConcepts.filter((c) => c.due !== null).length;
  const coverage = allConcepts.length ? scheduled / allConcepts.length : 0;

  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="text-2xl font-semibold">Tracker</h1>
      <p className="mt-1 text-sm text-gray-500">
        {Math.round(coverage * 100)}% of concepts scheduled &middot; {dueCount}{" "}
        due now
      </p>
      <p className="mt-1 text-xs text-gray-400">
        Rd read &middot; Rc recall &middot; Bd build &middot; Rv review
      </p>

      {chapterProgress.length === 0 && (
        <p className="mt-6 text-gray-500">No books ingested yet.</p>
      )}

      {chapterProgress.map((book) => (
        <section key={book.bookTitle} className="mt-8">
          <h2 className="text-lg font-medium">{book.bookTitle}</h2>
          <ul className="mt-2 divide-y divide-gray-200">
            {book.chapters.map((ch) => (
              <li
                key={ch.title}
                className="flex items-center justify-between gap-4 py-2"
              >
                <span className="truncate text-sm">{ch.title}</span>
                <div className="flex shrink-0 gap-1.5">
                  {CELLS.map((cell) => (
                    <Cell
                      key={cell.key}
                      label={cell.label}
                      short={cell.short}
                      on={ch[cell.key]}
                    />
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}

// Four phase cells, ordered. key indexes ChapterProgress booleans.
const CELLS = [
  { key: "read", label: "Read", short: "Rd" },
  { key: "recall", label: "Recall", short: "Rc" },
  { key: "build", label: "Build", short: "Bd" },
  { key: "review", label: "Review", short: "Rv" },
] as const;

// Filled = phase reached. title = full phase name (sealed: no rubric text).
function Cell({
  label,
  short,
  on,
}: {
  label: string;
  short: string;
  on: boolean;
}) {
  return (
    <span
      title={label}
      className={`inline-flex h-6 w-7 items-center justify-center rounded text-[10px] font-medium ${
        on ? "bg-green-600 text-white" : "bg-gray-100 text-gray-400"
      }`}
    >
      {short}
    </span>
  );
}
