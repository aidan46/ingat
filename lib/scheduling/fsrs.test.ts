import { Rating } from "ts-fsrs";
import { describe, expect, it } from "vitest";

import { type Concept } from "@/app/generated/prisma/client";
import { FsrsState, Tier } from "@/app/generated/prisma/enums";

import { initCard, reviewCard } from "./fsrs";

describe("initCard", () => {
  const now = new Date("2026-06-26T00:00:00Z");

  it("sets due to now (the schedulable bit)", () => {
    const due = initCard(now).due;
    expect(due).not.toBeNull();
    expect(due!.getTime()).toBe(now.getTime());
  });

  it("sets fsrsState to NEW (numeric State -> string conversion)", () => {
    expect(initCard(now).fsrsState).toBe("NEW");
  });

  it("zeroes the numeric fsrs fields", () => {
    const { stability, difficulty, elapsedDays, scheduledDays, reps, lapses } =
      initCard(now);
    expect(stability).toBe(0);
    expect(difficulty).toBe(0);
    expect(elapsedDays).toBe(0);
    expect(scheduledDays).toBe(0);
    expect(reps).toBe(0);
    expect(lapses).toBe(0);
  });

  it("sets lastReview null on a new card", () => {
    expect(initCard(now).lastReview).toBe(null);
  });
});

// Fixture: full Concept with a non-null due (a ReviewableConcept). Override per
// test. Defaults = a fresh NEW card (due=now).
function makeConcept(now: Date, overrides: Partial<Concept> = {}): Concept {
  return {
    id: "c1",
    chapterId: "ch1",
    label: "test concept",
    detail: "one sentence",
    weight: 2,
    currentTier: Tier.RECALL,
    fsrsState: FsrsState.NEW,
    stability: 0,
    difficulty: 0,
    elapsedDays: 0,
    scheduledDays: 0,
    reps: 0,
    lapses: 0,
    lastReview: null,
    due: now,
    createdAt: now,
    ...overrides,
  };
}

describe("reviewCard", () => {
  const now = new Date("2026-06-30T00:00:00Z");

  it("Good on a fresh card schedules forward and records a rep", () => {
    const concept = makeConcept(now);
    const result = reviewCard({ ...concept, due: now }, Rating.Good, now);

    expect(result.due).not.toBeNull();
    expect(result.due!.getTime()).toBeGreaterThan(now.getTime());
    expect(result.reps).toBe(1);
    expect(result.fsrsState).not.toBe(FsrsState.NEW);
  });

  it("Good on a REVIEW card grows the interval (also exercises the reverse map)", () => {
    // A matured card: in REVIEW, some stability, last reviewed 10 days ago.
    const lastReview = new Date("2026-06-20T00:00:00Z");
    const concept = makeConcept(now, {
      fsrsState: FsrsState.REVIEW,
      stability: 10,
      difficulty: 5,
      scheduledDays: 10,
      reps: 3,
      lastReview,
    });
    const result = reviewCard({ ...concept, due: now }, Rating.Good, now);
    const daysToMs = (days: number) => days * (1000 * 60 * 60 * 24);

    expect(result.scheduledDays).toBeGreaterThan(10);
    expect(result.due!.getTime()).toBeGreaterThan(now.getTime() + daysToMs(1));
    expect(result.fsrsState).toBe(FsrsState.REVIEW);
  });

  // Regression: a fresh card graded Good must GRADUATE and keep growing across a
  // persist->reconstruct round-trip. Guards the learning_steps-drop trap (card
  // stuck LEARNING/scheduledDays=0 forever). Round-trip is the point: the bug
  // lived in reconstruction, so a single reviewCard call wouldn't catch it.
  it("fresh card graduates to REVIEW and interval climbs across a round-trip", () => {
    const concept = makeConcept(now);

    // First review at now.
    const r1 = reviewCard({ ...concept, due: now }, Rating.Good, now);

    // Round-trip: r1 is the persisted columns. Rebuild a ReviewableConcept from
    // them (due narrowed non-null) and review again at its due date.
    const dueAt = r1.due!;
    const r2 = reviewCard(
      { ...concept, ...r1, due: dueAt },
      Rating.Good,
      dueAt,
    );

    expect(r1.fsrsState).toBe(FsrsState.REVIEW);
    expect(r1.scheduledDays).toBeGreaterThanOrEqual(1);
    expect(r2.fsrsState).toBe(FsrsState.REVIEW);
    expect(r2.scheduledDays).toBeGreaterThan(r1.scheduledDays);
  });
});
