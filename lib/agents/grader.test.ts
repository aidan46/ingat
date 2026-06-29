import { describe, it, expect, vi } from "vitest";

// grader.ts imports "server-only" (throws outside a server bundle) + the
// Anthropic adapter (builds a client at load). Stub both to test the schema alone.
vi.mock("server-only", () => ({}));
vi.mock("../llm/anthropic", () => ({ anthropic: {} }));

import { graderSchema } from "./grader";

const IDS = ["a", "b", "c"];

// A valid grader output for IDS: all captured, so partial/missed empty (legal).
// Spread `over` to mutate one field per case.
const output = (over: Record<string, unknown> = {}) => ({
  verdict: "v",
  captured: [...IDS],
  partial: [] as string[],
  missed: [] as string[],
  errors: [] as { claim: string; correction: string }[],
  questions: ["q"],
  ...over,
});

describe("graderSchema", () => {
  it("accepts a valid partition (every id exactly once)", () => {
    expect(
      graderSchema(IDS).safeParse(
        output({ captured: ["a"], partial: ["b"], missed: ["c"] }),
      ).success,
    ).toBe(true);
  });

  it("accepts all-captured (partial + missed empty)", () => {
    expect(graderSchema(IDS).safeParse(output()).success).toBe(true);
  });

  it("rejects a dropped id (missing from all buckets)", () => {
    expect(
      graderSchema(IDS).safeParse(output({ captured: ["a"] })).success,
    ).toBe(false);
  });

  it("rejects an invented id (not in the input set)", () => {
    expect(
      graderSchema(IDS).safeParse(output({ captured: ["a", "b", "z"] }))
        .success,
    ).toBe(false);
  });

  it("rejects a duplicated id (same id in two buckets)", () => {
    expect(
      graderSchema(IDS).safeParse(
        output({ captured: ["a", "a"], missed: ["b"] }),
      ).success,
    ).toBe(false);
  });

  it("rejects empty questions", () => {
    expect(graderSchema(IDS).safeParse(output({ questions: [] })).success).toBe(
      false,
    );
  });
});
