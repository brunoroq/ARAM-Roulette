export type RandomSource = () => number;

/** Uniform sampling without replacement. Inject RNG for reproducible tests. */
export function sample<T>(pool: readonly T[], count: number, random: RandomSource = Math.random): T[] {
  if (!Number.isInteger(count) || count < 0 || pool.length < count) {
    throw new Error(`Cannot draw ${count} options from a pool of ${pool.length}.`);
  }
  const remaining = [...pool];
  const result: T[] = [];
  for (let index = 0; index < count; index++) {
    const roll = random();
    if (!Number.isFinite(roll) || roll < 0 || roll >= 1) throw new Error('Random source must return a value in [0, 1).');
    result.push(remaining.splice(Math.floor(roll * remaining.length), 1)[0]);
  }
  return result;
}
