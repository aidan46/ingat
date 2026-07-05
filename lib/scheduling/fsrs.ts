import { type Card, createEmptyCard, fsrs, type Grade, State } from "ts-fsrs";

import { type Concept } from "@/app/generated/prisma/client";
import { FsrsState } from "@/app/generated/prisma/enums";

// Deterministic domain: pure ts-fsrs + arithmetic, no model.

// Numeric ts-fsrs State -> string FsrsState. Exhaustive Record: new upstream
// state breaks compile (vs a cast that wouldn't).
const STATE_TO_FSRS: Record<State, FsrsState> = {
  [State.New]: FsrsState.NEW,
  [State.Learning]: FsrsState.LEARNING,
  [State.Review]: FsrsState.REVIEW,
  [State.Relearning]: FsrsState.RELEARNING,
};

// Reverse of STATE_TO_FSRS, derived once: one source of truth for the pairing.
const FSRS_TO_STATE: Record<FsrsState, State> = Object.fromEntries(
  Object.entries(STATE_TO_FSRS).map(([k, v]) => [v, Number(k)]),
) as Record<FsrsState, State>;

function cardToColumns(
  card: Card,
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
  // snake->camel. Pure: route persists, scheduler never touches DB.
  return {
    fsrsState: STATE_TO_FSRS[card.state],
    stability: card.stability,
    difficulty: card.difficulty,
    // deprecated input: next() recomputes elapsed from last_review+now; mapped for round-trip fidelity.
    elapsedDays: card.elapsed_days,
    scheduledDays: card.scheduled_days,
    reps: card.reps,
    lapses: card.lapses,
    lastReview: card.last_review ?? null, // undefined on new card -> null; only nullable col.
    due: card.due,
  };
}

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
  return cardToColumns(createEmptyCard(now));
}

// due non-null: only an initialized (schedulable) card gets reviewed. Route
// narrows a loaded Concept before calling; illegal state unrepresentable here.
type ReviewableConcept = Omit<Concept, "due"> & { due: Date };

// Reverse of initCard: rebuild Card from stored cols, apply grade, map back. Pure.
export function reviewCard(
  concept: ReviewableConcept,
  grade: Grade,
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
  // Spread createEmptyCard base: inherits Card fields we don't store (e.g.
  // learning_steps), so an upstream field add won't break this literal.
  const reconstructedCard: Card = {
    ...createEmptyCard(now),
    state: FSRS_TO_STATE[concept.fsrsState],
    stability: concept.stability,
    difficulty: concept.difficulty,
    elapsed_days: concept.elapsedDays,
    scheduled_days: concept.scheduledDays,
    reps: concept.reps,
    lapses: concept.lapses,
    last_review: concept.lastReview ?? undefined,
    due: concept.due,
  };

  const card = fsrs({ enable_short_term: false }).next(
    reconstructedCard,
    now,
    grade,
  ).card;

  return cardToColumns(card);
}
