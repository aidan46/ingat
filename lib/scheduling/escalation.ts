import { Tier } from "@/app/generated/prisma/enums";

// Promotion policy. Edit-and-retest changeable; not runtime/env/DB config.
const GOOD = 3; // rating>=3 = solid (tester scale 1..4); <3 shaky, doesn't count
const THRESHOLD = 2; // 2 at-tier goods = survived a repeat, not a fluke

// Compile-time exhaustiveness: a new Tier member trips a type error here,
// not a silent undefined at runtime.
function absurd(x: never): never {
  throw new Error(`unhandled tier: ${String(x)}`);
}

// Next rung up tier ladder. BUILD terminal -> null (no promote past top).
export function nextTier(current: Tier): Tier | null {
  switch (current) {
    case Tier.RECALL:
      return Tier.EXPLAIN;
    case Tier.EXPLAIN:
      return Tier.APPLY;
    case Tier.APPLY:
      return Tier.BUILD;
    case Tier.BUILD:
      return null;
    default:
      return absurd(current); // 5th tier later -> current is that member, not never -> compile error
  }
}

// Promote current tier? True when >=THRESHOLD at-tier ratings cleared GOOD (cumulative).
// ratings = every rating logged at current tier (prior rows + one being written). Pure; route supplies.
export function shouldPromote(current: Tier, ratings: number[]): boolean {
  // Terminal tier: nothing above, never promote. Guard before counting.
  if (nextTier(current) === null) return false;

  return ratings.filter((r) => r >= GOOD).length >= THRESHOLD;
}

// Post-review tier from PRIOR at-tier ratings + THIS review's rating.
// Pure: current rating folded in HERE (off-by-one lives here, not the route).
// Returns tier to promote to, or null to hold at current.
export function promotionTarget(
  current: Tier,
  priorAtTierRatings: number[],
  currentRating: number,
): Tier | null {
  return shouldPromote(current, [...priorAtTierRatings, currentRating])
    ? nextTier(current)
    : null;
}
