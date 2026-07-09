import { Tier } from "@/app/generated/prisma/enums";

// Promotion policy. Edit-and-retest changeable; not runtime/env/DB config.
const GOOD = 3; // rating>=3 = solid (tester scale 1..4); <3 shaky, doesn't count
const THRESHOLD = 2; // 2 at-tier goods = survived a repeat, not a fluke

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
  }
}

// Promote current tier? True when >=THRESHOLD at-tier ratings cleared GOOD (cumulative).
// ratings = every rating logged at current tier (prior rows + one being written). Pure; route supplies.
export function shouldPromote(current: Tier, ratings: number[]): boolean {
  // Terminal tier: nothing above, never promote. Guard before counting.
  if (nextTier(current) === null) return false;

  return ratings.filter((r) => r >= GOOD).length >= THRESHOLD;
}
