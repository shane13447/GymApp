/**
 * Helpers for cycling through a program's workout days when building a queue.
 */

/**
 * Resolves the workout-day array index for the Nth queue slot by cycling
 * through the available days. Returns `null` when there are no days, which
 * guards against a modulo-by-zero (`n % 0 === NaN`) that would otherwise
 * produce an out-of-bounds, undefined day lookup.
 * @param {number} slotIndex - Zero-based queue slot being filled.
 * @param {number} totalDays - Number of workout days in the program.
 * @returns {number | null} The cycled day index, or `null` when `totalDays <= 0`.
 */
export const resolveCycledDayIndex = (slotIndex: number, totalDays: number): number | null => {
  if (!Number.isInteger(totalDays) || totalDays <= 0) {
    return null;
  }
  return ((slotIndex % totalDays) + totalDays) % totalDays;
};
