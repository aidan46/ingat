import { describe, expect, it, vi } from "vitest";

// extractor.ts imports "server-only" (throws outside a server bundle) + the
// Anthropic adapter (builds a client at load). Stub both to test the schema alone.
vi.mock("server-only", () => ({}));
vi.mock("../llm/anthropic", () => ({ anthropic: {} }));

import { extractorSchema } from "./extractor";

const TIERS = ["RECALL", "EXPLAIN", "APPLY", "BUILD"] as const;
const probe = (tier: string) => ({ tier, question: "q", expectedAnswer: "a" });
const concept = (probes: unknown[] = TIERS.map(probe)) => ({
  label: "L",
  detail: "d",
  weight: 2,
  probes,
});

describe("extractorSchema", () => {
  it("accepts a concept with four distinct-tier probes", () => {
    expect(extractorSchema.safeParse({ concepts: [concept()] }).success).toBe(
      true,
    );
  });

  it("rejects an empty concepts array (would seal an empty rubric)", () => {
    expect(extractorSchema.safeParse({ concepts: [] }).success).toBe(false);
  });

  it("rejects duplicate tiers (would violate @@unique on persist)", () => {
    const dup = [
      probe("RECALL"),
      probe("RECALL"),
      probe("APPLY"),
      probe("BUILD"),
    ];
    expect(
      extractorSchema.safeParse({ concepts: [concept(dup)] }).success,
    ).toBe(false);
  });

  it("rejects fewer than four probes", () => {
    const three = TIERS.slice(0, 3).map(probe);
    expect(
      extractorSchema.safeParse({ concepts: [concept(three)] }).success,
    ).toBe(false);
  });

  it("rejects a non-integer or out-of-range weight", () => {
    expect(
      extractorSchema.safeParse({ concepts: [{ ...concept(), weight: 4 }] })
        .success,
    ).toBe(false);
    expect(
      extractorSchema.safeParse({ concepts: [{ ...concept(), weight: 2.5 }] })
        .success,
    ).toBe(false);
  });
});
