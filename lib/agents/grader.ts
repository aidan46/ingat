import "server-only";

import { z } from "zod";

import { agentConfig, type Msg } from "../llm";
import { anthropic } from "../llm/anthropic";

// Output = AGENTS.md sec 2 contract MINUS score: route computes score
// deterministically (no LLM arithmetic). Partition refine (below)
// doesn't survive z.toJSONSchema into tool input_schema; validateWithRetry
// enforces post-call + retries on miss.
const graderShape = z.object({
  verdict: z.string().min(1),
  captured: z.array(z.string().min(1)),
  partial: z.array(z.string().min(1)),
  missed: z.array(z.string().min(1)),
  errors: z.array(
    z.object({
      claim: z.string().min(1),
      correction: z.string().min(1),
    }),
  ),
  questions: z.array(z.string().min(1)).min(1),
});

// z.infer pulls the static type from the schema: one source, no drift.
export type GraderOutput = z.infer<typeof graderShape>;

// Factory: refine closes over ids. captured/partial/missed must partition ids
// (every id exactly once, none invented). len-with-dups != ids.length catches
// dup+drop; every-id-in-set catches invented. Guards route's id->label map.
export function graderSchema(ids: string[]) {
  return graderShape.refine(
    (grader) => {
      const graderIds = [
        ...grader.captured,
        ...grader.missed,
        ...grader.partial,
      ];
      if (graderIds.length !== ids.length) return false;
      const graderSet = new Set(graderIds);
      return ids.every((value) => graderSet.has(value));
    },
    {
      message:
        "every concept id must appear exactly once across captured, partial, or missed",
    },
  );
}

// Principle 3 contract: grader sees id/label/detail/weight + summary, never
// chapter text or probes/expectedAnswers (those = the delayed test). Route
// imports this type so the call site can't pass more.
export type GraderInput = {
  concepts: { id: string; label: string; detail: string; weight: number }[];
  summary: string;
};

// No "return JSON" line: tool-use forces structure. No score line: route owns
// it. "ids verbatim" feeds the partition refine.
const SYSTEM = `You are grading a reader's from-memory summary of a textbook chapter against a fixed answer key.

The answer key is a list of concepts, each with an id, a label, a one-sentence detail of the understanding it requires, and a weight (1 to 3, higher is more important). You see only this key and the reader's summary, never the chapter itself. Grade against the key, not against prose you might expect.

Be exacting, not generous. A concept counts as captured only if the summary demonstrates the understanding the detail describes, not merely that the words appear.

Classify every concept by its exact id into one of three buckets:
- captured: the reader clearly conveyed the understanding.
- partial: the reader touched it but was vague, incomplete, or imprecise.
- missed: the reader did not convey it.
Every concept id must appear in exactly one bucket. Use the ids verbatim; do not invent ids or labels.

errors: list only claims the reader stated confidently that are wrong. For each, give the claim and a correction. An omission is not an error, that is a missed concept.

questions: write 2 to 3 probing questions aimed at the most important (highest weight) missed or partial concepts, to push the reader toward the gap. Not yes/no questions.

verdict: one blunt sentence summarizing how the recall went.`;

// Sees rubric key + user summary only. Per-call schema closes over ids.
// complete runs validateWithRetry internally. Never sets due (route+scheduler).
export function gradeRecall(input: GraderInput): Promise<GraderOutput> {
  const messages: Msg[] = [
    {
      role: "user",
      content: `Summary: ${input.summary}\nAnswer key: ${JSON.stringify(input.concepts)}`,
    },
  ];

  return anthropic.complete({
    system: SYSTEM,
    messages,
    schema: graderSchema(input.concepts.map((c) => c.id)),
    model: agentConfig.grader.model,
  });
}
