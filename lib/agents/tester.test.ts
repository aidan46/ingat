import { describe, expect, it, vi } from "vitest";

// tester.ts imports "server-only" (throws outside a server bundle) + the
// Anthropic adapter (builds a client at load). Stub both to test the schema alone.
vi.mock("server-only", () => ({}));
vi.mock("../llm/anthropic", () => ({ anthropic: {} }));

import { testerShape } from "./tester";

// Valid baseline; override one field per test to probe a single constraint.
const output = (overrides: Record<string, unknown> = {}) => ({
  correct: true,
  rating: 3,
  feedback: "missed the why",
  ...overrides,
});

describe("testerShape", () => {
  it("accepts a well-formed tester output", () => {
    expect(testerShape.safeParse(output()).success).toBe(true);
  });

  it("rejects rating below 1", () => {
    expect(testerShape.safeParse(output({ rating: 0 })).success).toBe(false);
  });

  it("rejects rating above 4", () => {
    expect(testerShape.safeParse(output({ rating: 5 })).success).toBe(false);
  });

  it("rejects a non-integer rating", () => {
    expect(testerShape.safeParse(output({ rating: 2.5 })).success).toBe(false);
  });

  it("rejects empty feedback", () => {
    expect(testerShape.safeParse(output({ feedback: "" })).success).toBe(false);
  });

  it("rejects a missing/!boolean correct", () => {
    expect(testerShape.safeParse(output({ correct: "yes" })).success).toBe(
      false,
    );
  });
});
