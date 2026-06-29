import { gradeRecall } from "@/lib/agents/grader";
import { prisma } from "@/lib/db";
import { initCard } from "@/lib/scheduling/fsrs";
import { computeScore } from "@/lib/scheduling/score";
import { z } from "zod";

const recallBody = z.object({
  chapterId: z.string(),
  summary: z.string().min(1),
});

// POST /api/recall - body: zod { chapterId: string, summary: string }
export async function POST(req: Request) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return new Response("Body must be JSON", { status: 400 });
  }
  const parsed = recallBody.safeParse(raw);
  if (!parsed.success)
    return Response.json({ error: "invalid body" }, { status: 400 });
  const { chapterId, summary } = parsed.data;

  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    select: {
      status: true,
      concepts: {
        select: {
          id: true,
          label: true,
          detail: true,
          weight: true,
          due: true,
        },
      },
    },
  });

  if (!chapter) return new Response("Chapter not found", { status: 404 });
  if (chapter.status !== "EXTRACTED")
    return new Response("Chapter not extracted", { status: 409 });

  const { verdict, captured, partial, missed, errors, questions } =
    await gradeRecall({
      // 4-field only: grader never sees due.
      concepts: chapter.concepts.map(({ id, label, detail, weight }) => ({
        id,
        label,
        detail,
        weight,
      })),
      summary,
    });

  // Score deterministic: route computes, not grader.
  const weights = new Map(chapter.concepts.map((c) => [c.id, c.weight]));
  const score = computeScore(captured, partial, weights);

  // Init only unseen cards (due null); re-grade keeps existing FSRS state.
  const now = new Date();
  const newCards = chapter.concepts
    .filter((c) => c.due === null)
    .map((c) => ({ id: c.id, ...initCard(now) }));

  const recallSessionCreate = prisma.recallSession.create({
    data: {
      chapterId,
      summary,
      score,
      result: { verdict, captured, partial, missed, errors, questions },
    },
  });
  const conceptUpdates = newCards.map(({ id, ...data }) =>
    prisma.concept.update({ where: { id }, data }),
  );

  // Atomic: never persist a session without its card-inits.
  await prisma.$transaction([recallSessionCreate, ...conceptUpdates]);

  // Sealed: labels out, ids/probes stay server-side.
  const labelMap = new Map(chapter.concepts.map((c) => [c.id, c.label]));

  return Response.json({
    score,
    captured: captured.map((id) => labelMap.get(id)!),
    partial: partial.map((id) => labelMap.get(id)!),
    missed: missed.map((id) => labelMap.get(id)!),
    errors,
    questions,
    verdict,
  });
}
