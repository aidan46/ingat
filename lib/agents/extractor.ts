import "server-only";

import { z } from "zod";

import { agentConfig, type Msg } from "../llm";
import { anthropic } from "../llm/anthropic";

// Schema validates the AGENTS.md contract. NB: zod refinements (the distinct-tier
// check) do NOT survive z.toJSONSchema into the tool input_schema - the model
// isn't bound by them; validateWithRetry enforces them post-call and retries on a
// miss. Bad extraction never hits a Prisma violation.

const probeSchema = z.object({
  tier: z.enum(["RECALL", "EXPLAIN", "APPLY", "BUILD"]),
  question: z.string().min(1),
  expectedAnswer: z.string().min(1),
});

const conceptSchema = z.object({
  label: z.string().min(1),
  detail: z.string().min(1),
  weight: z.int().min(1).max(3),
  // Exactly 4 probes, distinct tiers. .length(4) reaches the tool schema; the
  // refine does NOT (enforced post-call). Together guard @@unique([conceptId,
  // tier]); a miss retries.
  probes: z
    .array(probeSchema)
    .refine((probes) => new Set(probes.map((p) => p.tier)).size === 4, {
      message: "exactly one probe per tier: RECALL, EXPLAIN, APPLY, BUILD",
    })
    .length(4),
});

export const extractorSchema = z.object({
  // .min(1) so {concepts:[]} retries, not seals an empty rubric EXTRACTED (guard
  // then blocks re-extract). Upper bound soft (prompt 6-10): 5/11 can be valid.
  concepts: z.array(conceptSchema).min(1),
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
- probes: exactly four, one for each tier (use all four tiers, never repeat a tier):
  - RECALL: what it is and why it exists.
  - EXPLAIN: a contrast or boundary, when it breaks or how it differs from a sibling concept.
  - APPLY: trace or use it on a new, concrete example not drawn from the chapter.
  - BUILD: implement it or sketch the architecture, a design or coding task.
  Each probe has a question and a concise expectedAnswer a grader can mark against.

Base everything strictly on the chapter. Invent nothing.`;

// Sees chapter text, GENERATES the key. Never sees a user answer.
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
