import { describe, it, expect } from "vitest";
import { computeScore } from "./score";

describe("computeScore", () => {
  // weights: a=2, b=1, c=1 (total 4)
  const weights = new Map([
    ["a", 2],
    ["b", 1],
    ["c", 1],
  ]);

  it("returns 100 when every concept is captured", () => {
    const captured = ["a", "b", "c"];
    const partial: string[] = [];
    expect(computeScore(captured, partial, weights)).toBe(100);
  });

  it("returns 0 when everything is missed", () => {
    const captured: string[] = [];
    const partial: string[] = [];
    expect(computeScore(captured, partial, weights)).toBe(0);
  });

  it("counts a partial as half its weight", () => {
    // captured ["a"](2) + partial ["b"](1)*0.5 over total 4 -> round(100*2.5/4) = 63
    const captured = ["a"];
    const partial = ["b"];
    expect(computeScore(captured, partial, weights)).toBe(63);
  });

  it("returns 0 for empty weights (no divide-by-zero)", () => {
    const captured: string[] = [];
    const partial: string[] = [];
    const weights: Map<string, number> = new Map();
    expect(computeScore(captured, partial, weights)).toBe(0);
  });
});
