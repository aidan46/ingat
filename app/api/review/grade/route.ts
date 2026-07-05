import { z } from "zod";

import { gradeAnswer } from "@/lib/agents/tester";
import { prisma } from "@/lib/db";
import { reviewCard } from "@/lib/scheduling/fsrs";

const gradeBody = z.object({
  conceptId: z.string(),
  answer: z.string().trim().min(1), // trim first: reject whitespace-only at the boundary
});

// POST /api/review/grade - body: zod { conceptId, answer }. Orchestrates both
// domains: tester judges (rating), scheduler does FSRS math. Route only wires;
// no judging or interval math here.
export async function POST(req: Request) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return new Response("Body must be JSON", { status: 400 });
  }
  const parsed = gradeBody.safeParse(raw);
  if (!parsed.success)
    return Response.json({ error: "invalid body" }, { status: 400 });
  const { conceptId, answer } = parsed.data;

  const concept = await prisma.concept.findUnique({
    where: {
      id: conceptId,
    },
  });

  if (!concept) {
    return new Response("Concept not found", { status: 404 });
  }

  const probe = await prisma.probe.findUnique({
    where: { conceptId_tier: { conceptId, tier: concept.currentTier } },
  });

  if (!probe) {
    return new Response("Probe not found", { status: 404 });
  }

  // due null = card never initialized (no recall yet), not reviewable.
  // Narrow a const local, NOT concept.due: property narrowing resets across the
  // await below; const-local narrowing survives.
  const { due } = concept;
  if (due === null) {
    return new Response("Concept not scheduled", { status: 409 });
  }

  const { correct, rating, feedback } = await gradeAnswer({
    probe: {
      tier: concept.currentTier,
      question: probe.question,
      expectedAnswer: probe.expectedAnswer,
    },
    answer,
  });

  // narrowed due overrides nullable col -> ReviewableConcept, no cast. rating
  // (1..4, validated by testerShape) is the only number the scheduler consumes.
  const now = new Date();
  const updated = reviewCard({ ...concept, due }, rating, now);

  const reviewLog = prisma.reviewLog.create({
    data: {
      conceptId,
      tier: concept.currentTier,
      answer,
      rating,
      correct,
      feedback,
    },
  });
  const conceptUpdate = prisma.concept.update({
    where: { id: conceptId },
    data: updated,
  });
  // Atomic: never log a review without advancing the card, or vice versa.
  await prisma.$transaction([reviewLog, conceptUpdate]);

  // Sealed reveal: expectedAnswer crosses the wire only post-submit (here),
  // never in the due queue.
  return Response.json({
    correct,
    rating,
    feedback,
    expectedAnswer: probe.expectedAnswer,
  });
}
