import "server-only";

import { z } from "zod";

import { type Tier } from "@/app/generated/prisma/enums";

import { agentConfig, type Msg } from "../llm";
import { anthropic } from "../llm/anthropic";

// Output contract: correct/rating/feedback. rating 1..4 = FSRS
// Again/Hard/Good/Easy; only number the scheduler consumes.
export const testerShape = z.object({
  correct: z.boolean(),
  rating: z.int().min(1).max(4),
  feedback: z.string().min(1),
});

// Sees one probe (tier/question/expectedAnswer) + the user's answer, never the
// chapter. No "return JSON" line: tool-use forces structure. rating is the only
// number the scheduler consumes; route maps it to an ts-fsrs Grade.
const SYSTEM = `You are grading a single answer in a spaced-repetition review against a fixed expected answer.

You are given a probe: a tier, a question, and the expected answer that defines what a correct response must demonstrate. You also get the user's answer. You never see the source chapter. Grade the answer against the expected answer, not against prose you might expect elsewhere.

The tier sets what kind of understanding the question demands:
- RECALL: state the fact or definition.
- EXPLAIN: explain how or why it works, not just name it.
- APPLY: use it correctly on a concrete case.
- BUILD: sketch a design or pseudocode that would work; judge the approach, not exact syntax.

Be exacting, not generous. Reward demonstrated understanding at the probe's tier, not keyword overlap with the expected answer.

Decide two things:
- correct: true only if the answer demonstrates the understanding the expected answer requires at this tier.
- rating, an integer 1 to 4 mapping answer quality:
  1 = wrong, blank, or irrelevant.
  2 = on the right track but shaky, incomplete, or partly wrong.
  3 = solid and essentially correct.
  4 = fluent, complete, and precise.

feedback: one or two sentences naming the specific gap or error. If the answer is fluent, say briefly what made it strong. Never restate the expected answer verbatim.`;

export type TesterOutput = z.infer<typeof testerShape>;

// Sealed: probe (incl expectedAnswer, server-side) + answer only, never chapter.
// Route imports this type so the call site can't pass more.
export type TesterInput = {
  probe: { tier: Tier; question: string; expectedAnswer: string };
  answer: string;
};

// complete runs validateWithRetry internally. Never sets a rating beyond 1..4.
export function gradeAnswer(input: TesterInput): Promise<TesterOutput> {
  const messages: Msg[] = [
    {
      role: "user",
      content: `Probe: ${JSON.stringify(input.probe)}\nAnswer: ${input.answer}`,
    },
  ];

  return anthropic.complete({
    system: SYSTEM,
    messages,
    schema: testerShape,
    model: agentConfig.tester.model,
  });
}
