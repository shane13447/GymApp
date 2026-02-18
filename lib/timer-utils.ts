/**
 * Timer Utility Functions
 * Pure functions for timer calculations that can be unit tested independently
 */

// =============================================================================
// CONSTANTS
// =============================================================================

/** Minimum allowed rest time in seconds */
export const MIN_REST_TIME_SECONDS = 1;

/** Default rest time if not specified */
export const DEFAULT_REST_TIME_SECONDS = 180;

/** Maximum reasonable timer duration (15 minutes) */
export const MAX_REASONABLE_TIME_SECONDS = 15 * 60;

/** Threshold for notifying about completed timers (60 seconds) */
export const TIMER_NOTIFICATION_THRESHOLD_MS = 60000;

// =============================================================================
// TIMER CALCULATION FUNCTIONS
// =============================================================================

/**
 * Sanitize rest time to ensure it's a valid positive number
 * @param restTime - Raw rest time value (could be undefined, null, 0, negative, NaN, Infinity)
 * @returns Sanitized rest time clamped between MIN_REST_TIME_SECONDS (1) and MAX_REASONABLE_TIME_SECONDS (900).
 *          Returns DEFAULT_REST_TIME_SECONDS (180) for null, undefined, NaN, or Infinity inputs.
 */
export function sanitizeRestTime(restTime: number | undefined | null): number {
  // Handle null/undefined with nullish coalescing (preserves 0 as valid input)
  const rawRestTime = restTime ?? DEFAULT_REST_TIME_SECONDS;
  
  // Guard against NaN and Infinity
  if (!Number.isFinite(rawRestTime)) {
    return DEFAULT_REST_TIME_SECONDS;
  }
  
  // Clamp between minimum and maximum bounds
  return Math.max(MIN_REST_TIME_SECONDS, Math.min(rawRestTime, MAX_REASONABLE_TIME_SECONDS));
}

/**
 * Calculate remaining time from an end timestamp
 * @param endTimestamp - Unix timestamp (ms) when timer should end
 * @param now - Current time (ms), defaults to Date.now()
 * @returns Remaining seconds (can be negative if timer expired)
 */
export function calculateRemainingTime(endTimestamp: number, now: number = Date.now()): number {
  return Math.ceil((endTimestamp - now) / 1000);
}

/**
 * Check if remaining time is valid (not affected by clock manipulation)
 * @param remaining - Remaining time in seconds
 * @returns true if time is within reasonable bounds
 */
export function isValidRemainingTime(remaining: number): boolean {
  return remaining >= 0 && remaining <= MAX_REASONABLE_TIME_SECONDS;
}

/**
 * Clamp remaining time to valid range
 * @param remaining - Raw remaining time in seconds
 * @param maxTime - Maximum allowed time (usually restTimeSeconds)
 * @returns Clamped value between 0 and maxTime
 */
export function clampRemainingTime(remaining: number, maxTime: number): number {
  return Math.max(0, Math.min(remaining, maxTime));
}

/**
 * Calculate timer progress percentage
 * @param remaining - Remaining seconds
 * @param total - Total timer duration in seconds
 * @returns Progress percentage (0-100), 0 if invalid inputs
 */
export function calculateTimerProgress(remaining: number, total: number): number {
  if (remaining <= 0 || total <= 0) return 0;
  return Math.min(100, (remaining / total) * 100);
}

/**
 * Format seconds to MM:SS display string
 * @param seconds - Number of seconds
 * @returns Formatted string like "3:05" or "0:30"
 */
export function formatTime(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(safeSeconds / 60);
  const secs = safeSeconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Check if a completed timer should trigger a notification
 * (only if it completed recently, not if user was away for a long time)
 * @param endTimestamp - When the timer ended
 * @param now - Current time (ms)
 * @returns true if notification should be shown
 */
export function shouldNotifyTimerComplete(endTimestamp: number, now: number = Date.now()): boolean {
  return endTimestamp > now - TIMER_NOTIFICATION_THRESHOLD_MS;
}

/**
 * Determine timer state from end timestamp
 * @param endTimestamp - Unix timestamp (ms) when timer should end
 * @param now - Current time (ms)
 * @returns Object with timer state information
 */
export function getTimerState(endTimestamp: number, now: number = Date.now()): {
  remaining: number;
  isRunning: boolean;
  isCompleted: boolean;
  isValid: boolean;
} {
  const remaining = calculateRemainingTime(endTimestamp, now);
  const isValid = isValidRemainingTime(remaining);
  
  return {
    remaining: Math.max(0, remaining),
    isRunning: remaining > 0 && isValid,
    isCompleted: remaining <= 0,
    isValid,
  };
}
