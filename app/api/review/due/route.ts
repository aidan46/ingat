import { prisma } from "@/lib/db";

// Due-today queue. Derived, no new column: due <= now (lte excludes null =
// un-init'd cards). Most-overdue-first; spans books. Sealed select: label +
// titles + current-tier probe QUESTION (presentable). expectedAnswer NEVER
// selected here; revealed only post-submit by /grade.
export async function GET() {
  const now = new Date();

  const dueConcepts = await prisma.concept.findMany({
    where: { due: { lte: now } },
    select: {
      id: true,
      label: true,
      currentTier: true,
      chapter: {
        select: {
          title: true,
          book: { select: { title: true, slug: true } },
        },
      },
      probes: { select: { tier: true, question: true } },
    },
    orderBy: { due: "asc" },
  });

  // Shape to one question per concept: pick the current-tier probe, drop the
  // rest.
  const queue = dueConcepts.map((c) => ({
    id: c.id,
    label: c.label,
    currentTier: c.currentTier,
    chapter: c.chapter,
    question: c.probes.find((p) => p.tier === c.currentTier)?.question,
  }));

  return Response.json(queue);
}
