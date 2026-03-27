/** Money in integer minor units (e.g. cents) to avoid float drift. */

export type MoneyCents = number & { readonly __brand: 'MoneyCents' };

export function money(cents: number): MoneyCents {
  if (!Number.isInteger(cents) || cents < 0) {
    throw new RangeError('Money must be a non-negative integer (cents)');
  }
  return cents as MoneyCents;
}

export function addMoney(a: MoneyCents, b: MoneyCents): MoneyCents {
  const result = a + b;
  if (!Number.isInteger(result) || result < 0) {
    throw new RangeError(`addMoney result must be non-negative integer, got ${result}`);
  }
  return result as MoneyCents;
}

export function subtractMoney(a: MoneyCents, b: MoneyCents): MoneyCents {
  const result = a - b;
  if (!Number.isInteger(result) || result < 0) {
    throw new RangeError(`subtractMoney result must be non-negative integer, got ${result}`);
  }
  return result as MoneyCents;
}
