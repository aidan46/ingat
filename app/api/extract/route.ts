import { prisma } from "@/lib/db";
import { loadChapterBody } from "@/lib/ingestion/load-chapter-body";
import { z } from "zod";
import { extractChapter } from "@/lib/agents/extractor";

// POST /api/extract - body: { chapterId, force? }
// Load body (transient), extract, persist Concepts + Probes, flip to EXTRACTED.
// Body never stored (principle 4); rubric never returned (principle 6) - counts
// only. Idempotent: re-run replaces this chapter's concepts, never duplicates.
export async function POST(req: Request) {
  // Validate at the trust boundary: malformed body is a 400, not an uncaught 500.
  // req.json() throws on non-JSON.
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return new Response("Body must be JSON", { status: 400 });
  }
  const parsed = z
    .object({ chapterId: z.string(), force: z.boolean().optional() })
    .safeParse(raw);
  if (!parsed.success) {
    return new Response("Expected { chapterId: string, force?: boolean }", {
      status: 400,
    });
  }
  const { chapterId, force } = parsed.data;

  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    include: { book: true },
  });
  if (!chapter) return new Response("Chapter not found", { status: 404 });
  // mdBook only for now; loadChapterBody throws on other sources. Guard here
  // for a clean 400 (loadChapterBody dispatches sourceType when a source lands).
  if (chapter.book.sourceType !== "MDBOOK") {
    return new Response(`Unsupported sourceType: ${chapter.book.sourceType}`, {
      status: 400,
    });
  }

  // Extraction = expensive billed call, rubric cached forever. Skip if already
  // EXTRACTED; `force` re-extracts on purpose (source changed / prove idempotent).
  if (chapter.status === "EXTRACTED" && !force) {
    return Response.json({ chapterId, skipped: true });
  }

  const chapterMarkdown = await loadChapterBody(chapter);

  const result = await extractChapter({
    chapterTitle: chapter.title,
    chapterMarkdown,
  });

  // Idempotent persist keyed on chapterId. Labels are LLM-generated + drift, so
  // upsert-on-label would duplicate; delete-all + recreate can't. Cascade drops
  // old probes. deleteMany also self-heals a crashed prior run (clears orphans).
  // DESTRUCTIVE post-M4: wipes FSRS state + ReviewLog history once concepts have
  // them - hence re-extraction is gated behind `force`, not the default path.
  await prisma.$transaction(async (tx) => {
    await tx.concept.deleteMany({ where: { chapterId } });
    for (const c of result.concepts) {
      await tx.concept.create({
        data: {
          chapterId,
          label: c.label,
          detail: c.detail,
          weight: c.weight,
          probes: {
            create: c.probes.map((p) => ({
              tier: p.tier,
              question: p.question,
              expectedAnswer: p.expectedAnswer,
            })),
          },
        },
      });
    }
    await tx.chapter.update({
      where: { id: chapterId },
      data: { status: "EXTRACTED" },
    });
  });

  return Response.json({ chapterId, conceptCount: result.concepts.length });
}
