import { type Concept } from "@/app/generated/prisma/client";
import { FsrsState } from "@/app/generated/prisma/enums";
import { createEmptyCard, State } from "ts-fsrs";

// Deterministic domain: pure ts-fsrs/arithmetic, no model. M4 =
// card-init only; review-interval math (fsrs.repeat) is M5.

// Numeric ts-fsrs State -> string Prisma FsrsState. Record is exhaustive: new
// upstream state breaks compile (vs a .toUpperCase() cast that wouldn't).
const STATE_TO_FSRS: Record<State, FsrsState> = {
  [State.New]: FsrsState.NEW,
  [State.Learning]: FsrsState.LEARNING,
  [State.Review]: FsrsState.REVIEW,
  [State.Relearning]: FsrsState.RELEARNING,
};

export function initCard(
  now: Date,
): Pick<
  Concept,
  | "fsrsState"
  | "stability"
  | "difficulty"
  | "elapsedDays"
  | "scheduledDays"
  | "reps"
  | "lapses"
  | "lastReview"
  | "due"
> {
  // createEmptyCard: due=now, state=New, rest 0. Non-null due = schedulable.
  // Pure: route writes; scheduler never touches DB. Map snake->camel here.
  const card = createEmptyCard(now);
  return {
    fsrsState: STATE_TO_FSRS[card.state],
    stability: card.stability,
    difficulty: card.difficulty,
    elapsedDays: 0, // elapsed_days deprecated upstream; new card = 0
    scheduledDays: card.scheduled_days,
    reps: card.reps,
    lapses: card.lapses,
    lastReview: card.last_review ?? null, // undefined on new card; only nullable col
    due: card.due,
  };
}
