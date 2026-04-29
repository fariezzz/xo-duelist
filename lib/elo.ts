export function kFactor(rating: number): number {
  if (rating < 1000) return 32;
  if (rating < 1200) return 24;
  return 16;
}

export function expectedScore(a: number, b: number): number {
  return 1 / (1 + Math.pow(10, (b - a) / 400));
}

export function newRating(oldRating: number, opponentRating: number, actual: number): number {
  const k = kFactor(oldRating);
  const exp = expectedScore(oldRating, opponentRating);
  return Math.round(oldRating + k * (actual - exp));
}
