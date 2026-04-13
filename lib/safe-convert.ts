/**
 * Safe numeric string-to-number conversion helpers.
 *
 * Replaces the `parseFloat(x) || default` and `parseInt(x, 10) || default`
 * patterns that silently corrupt zero values (since `parseFloat("0")` and
 * `parseInt("0", 10)` evaluate to `0`, which is falsy, causing the fallback
 * to fire incorrectly).
 *
 * Every function is pure and has no side effects, making it safe for
 * strict-zone parity testing.
 */

/**
 * Parses a string (or number) as a floating-point value, returning the fallback
 * only when the input cannot be converted to a finite number.
 *
 * Unlike `parseFloat(x) || fallback`, this correctly preserves `0`, `-0`, and
 * `0.0` as valid values.
 */
export const safeParseFloat = (value: string | number, fallback: number): number => {
  // Number('') === 0 (coercion quirk), so empty string must fall through.
  if (typeof value === 'string' && value.trim() === '') return fallback;
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

/**
 * Parses a string (or number) as an integer value, returning the fallback
 * only when the input cannot be converted to a finite integer.
 *
 * Unlike `parseInt(x, 10) || fallback`, this correctly preserves `0` as a
 * valid value.
 */
export const safeParseInt = (value: string | number, fallback: number): number => {
  // Number('') === 0 (coercion quirk), so empty string must fall through.
  if (typeof value === 'string' && value.trim() === '') return fallback;
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? Math.trunc(numeric) : fallback;
};

