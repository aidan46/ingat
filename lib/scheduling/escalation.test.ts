import { describe, expect, it } from "vitest";

import { Tier } from "@/app/generated/prisma/enums";

import { nextTier, promotionTarget, shouldPromote } from "./escalation";

describe("nextTier", () => {
  it("walks the ladder RECALL -> EXPLAIN -> APPLY -> BUILD", () => {
    expect(nextTier(Tier.RECALL)).toBe(Tier.EXPLAIN);
    expect(nextTier(Tier.EXPLAIN)).toBe(Tier.APPLY);
    expect(nextTier(Tier.APPLY)).toBe(Tier.BUILD);
  });

  it("returns null at BUILD (terminal, no rung above)", () => {
    expect(nextTier(Tier.BUILD)).toBe(null);
  });
});

describe("shouldPromote", () => {
  it("promotes on THRESHOLD good ratings (cumulative)", () => {
    expect(shouldPromote(Tier.RECALL, [3, 3])).toBe(true);
  });

  it("holds below THRESHOLD (one good is a fluke)", () => {
    expect(shouldPromote(Tier.RECALL, [3, 1])).toBe(false);
  });

  it("counts non-consecutive goods (cumulative, not a streak)", () => {
    // Load-bearing: encodes cumulative choice. Consecutive would expect false.
    expect(shouldPromote(Tier.RECALL, [3, 1, 3])).toBe(true);
  });

  it("never promotes at BUILD even with all-good ratings (terminal)", () => {
    expect(shouldPromote(Tier.BUILD, [4, 4])).toBe(false);
  });
});

// Route-level off-by-one lives here now: current rating folded in, prior rows separate.
// Flip-check: drop currentRating from the spread in promotionTarget -> "second good" goes red.
describe("promotionTarget", () => {
  it("holds on the first good (prior [] + this 3 = one good < THRESHOLD)", () => {
    expect(promotionTarget(Tier.RECALL, [], 3)).toBe(null);
  });

  it("promotes on the second good (prior [3] + this 3 = two)", () => {
    expect(promotionTarget(Tier.RECALL, [3], 3)).toBe(Tier.EXPLAIN);
  });

  it("does not count a shaky current rating (prior [3] + this 1 holds)", () => {
    expect(promotionTarget(Tier.RECALL, [3], 1)).toBe(null);
  });

  it("never promotes past BUILD (terminal) even with goods", () => {
    expect(promotionTarget(Tier.BUILD, [4], 4)).toBe(null);
  });
});
