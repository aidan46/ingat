import "server-only";
import { z } from "zod";
import { anthropic } from "../llm/anthropic";
import { agentConfig, type Msg } from "../llm";

// Output schema = structural enforcement of the AGENTS.md contract. Bad
// extraction fails here (-> retry in validateWithRetry), never reaches a Prisma
// constraint violation.

const probeSchema = z.object({
  tier: z.enum(["RECALL", "EXPLAIN", "APPLY", "BUILD"]),
  question: z.string().min(1),
  expectedAnswer: z.string().min(1),
});

const conceptSchema = z.object({
  label: z.string().min(1),
  detail: z.string().min(1),
  weight: z.int().min(1).max(3),
  // Exactly 4 probes, one per distinct tier: .length(4) caps count, refine forces
  // all 4 tiers. Protects @@unique([conceptId, tier]) - bad shape retries.
  probes: z
    .array(probeSchema)
    .refine((probes) => new Set(probes.map((p) => p.tier)).size === 4, {
      message: "exactly one probe per tier: RECALL, EXPLAIN, APPLY, BUILD",
    })
    .length(4),
});

const extractorSchema = z.object({
  concepts: z.array(conceptSchema),
});

// z.infer pulls the static type from the schema: one source, no drift.
export type ExtractorOutput = z.infer<typeof extractorSchema>;

// Extractor instructions (the answer key). No "return JSON" line: tool-use forces
// structure, so the prompt describes concepts, not format.
const SYSTEM = `You are building a durable answer key for spaced-retention testing of a textbook chapter.

Extract the 6 to 10 most important concepts a reader must retain. For each concept provide:
- label: a short name for the concept.
- detail: one sentence on what understanding it requires.
- weight: an integer 1 to 3, where 3 is load-bearing.
- probes: exactly four, one per tier:
  - RECALL: what it is and why it exists.
  - EXPLAIN: a contrast or boundary, when it breaks or how it differs from a sibling concept.
  - APPLY: trace or use it on a new, concrete example not drawn from the chapter.
  - BUILD: implement it or sketch the architecture, a design or coding task.
  Each probe has a question and a concise expectedAnswer a grader can mark against.

Base everything strictly on the chapter. Invent nothing.`;

// Sees chapter text, GENERATES the key. Never sees a user answer (principle 3).
export function extractChapter(input: {
  chapterTitle: string;
  chapterMarkdown: string;
}): Promise<ExtractorOutput> {
  const messages: Msg[] = [
    {
      role: "user",
      content: `Title: ${input.chapterTitle}\nMarkdown: ${input.chapterMarkdown}`,
    },
  ];

  return anthropic.complete({
    system: SYSTEM,
    messages,
    schema: extractorSchema,
    model: agentConfig.extractor.model,
  });
}
