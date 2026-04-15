export const DEFAULT_QUEUE_HORIZON = 3;
export const MIN_QUEUE_HORIZON = 1;
export const MAX_QUEUE_HORIZON = 9;

export type QueueHorizonBlurResult = {
  inputValue: string;
  horizon: number;
};

/**
 * Keeps the latest valid digit from raw queue horizon input.
 *
 * @param text - Raw value emitted by the React Native TextInput.
 * @returns A single 1-9 digit string, or an empty string when no valid digit exists.
 */
export function sanitizeQueueHorizonInput(text: string): string {
  return text.replace(/[^1-9]/g, '').slice(-1);
}

/**
 * Resolves queue horizon display and numeric state after editing ends.
 *
 * @param inputValue - Current sanitized input display value.
 * @param lastValidHorizon - Last accepted queue horizon number.
 * @returns The display value and numeric horizon to keep after the input blurs.
 */
export function resolveQueueHorizonBlur(
  inputValue: string,
  lastValidHorizon: number,
): QueueHorizonBlurResult {
  const fallbackHorizon =
    Number.isInteger(lastValidHorizon) &&
    lastValidHorizon >= MIN_QUEUE_HORIZON &&
    lastValidHorizon <= MAX_QUEUE_HORIZON
      ? lastValidHorizon
      : DEFAULT_QUEUE_HORIZON;
  const sanitizedInput = sanitizeQueueHorizonInput(inputValue);

  if (!sanitizedInput) {
    return {
      inputValue: String(fallbackHorizon),
      horizon: fallbackHorizon,
    };
  }

  const horizon = Number.parseInt(sanitizedInput, 10);
  return {
    inputValue: String(horizon),
    horizon,
  };
}
