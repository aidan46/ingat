import { describe, expect, it } from "vitest";

import { Tier } from "@/app/generated/prisma/enums";

import { nextTier, shouldPromote } from "./escalation";

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
