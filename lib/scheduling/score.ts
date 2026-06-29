export function computeScore(
  captured: string[],
  partial: string[],
  weights: Map<string, number>,
): number {
  const sum = (ids: string[]) =>
    ids.reduce((acc, id) => acc + (weights.get(id) ?? 0), 0);
  const allIds: string[] = Array.from(weights.keys());
  const totalSum = sum(allIds);
  if (totalSum === 0) {
    return 0;
  }

  return Math.round((100 * (sum(captured) + 0.5 * sum(partial))) / totalSum);
}
