import { describe, it, expect } from "vitest";
import { initCard } from "./fsrs";

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
