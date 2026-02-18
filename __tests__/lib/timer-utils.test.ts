/**
 * Timer Utilities Tests
 * Tests for pure timer calculation functions
 */

import {
    calculateRemainingTime,
    calculateTimerProgress,
    clampRemainingTime,
    DEFAULT_REST_TIME_SECONDS,
    formatTime,
    getTimerState,
    isValidRemainingTime,
    MAX_REASONABLE_TIME_SECONDS,
    MIN_REST_TIME_SECONDS,
    sanitizeRestTime,
    shouldNotifyTimerComplete,
    TIMER_NOTIFICATION_THRESHOLD_MS,
} from '@/lib/timer-utils';

// =============================================================================
// sanitizeRestTime Tests
// =============================================================================

describe('sanitizeRestTime', () => {
  describe('valid data', () => {
    it('should return the value if positive', () => {
      expect(sanitizeRestTime(180)).toBe(180);
      expect(sanitizeRestTime(60)).toBe(60);
      expect(sanitizeRestTime(300)).toBe(300);
    });

    it('should return minimum for value of 1', () => {
      expect(sanitizeRestTime(1)).toBe(1);
    });
  });

  describe('invalid data', () => {
    it('should return default for undefined', () => {
      expect(sanitizeRestTime(undefined)).toBe(DEFAULT_REST_TIME_SECONDS);
    });

    it('should return default for null', () => {
      expect(sanitizeRestTime(null)).toBe(DEFAULT_REST_TIME_SECONDS);
    });

    it('should return minimum for 0 (nullish coalescing preserves 0)', () => {
      // Using ?? instead of || means 0 is treated as a valid number, then clamped to minimum
      expect(sanitizeRestTime(0)).toBe(MIN_REST_TIME_SECONDS);
    });

    it('should return minimum for negative values', () => {
      expect(sanitizeRestTime(-1)).toBe(MIN_REST_TIME_SECONDS);
      expect(sanitizeRestTime(-100)).toBe(MIN_REST_TIME_SECONDS);
    });
  });

  describe('NaN and Infinity handling', () => {
    it('should return default for NaN', () => {
      expect(sanitizeRestTime(NaN)).toBe(DEFAULT_REST_TIME_SECONDS);
    });

    it('should return default for Infinity', () => {
      expect(sanitizeRestTime(Infinity)).toBe(DEFAULT_REST_TIME_SECONDS);
    });

    it('should return default for negative Infinity', () => {
      expect(sanitizeRestTime(-Infinity)).toBe(DEFAULT_REST_TIME_SECONDS);
    });
  });

  describe('edge cases', () => {
    it('should cap very large values at MAX_REASONABLE_TIME_SECONDS', () => {
      expect(sanitizeRestTime(999999)).toBe(MAX_REASONABLE_TIME_SECONDS);
      expect(sanitizeRestTime(MAX_REASONABLE_TIME_SECONDS + 1)).toBe(MAX_REASONABLE_TIME_SECONDS);
    });

    it('should allow values at exactly MAX_REASONABLE_TIME_SECONDS', () => {
      expect(sanitizeRestTime(MAX_REASONABLE_TIME_SECONDS)).toBe(MAX_REASONABLE_TIME_SECONDS);
    });

    it('should handle fractional values', () => {
      expect(sanitizeRestTime(0.5)).toBe(MIN_REST_TIME_SECONDS);
      expect(sanitizeRestTime(1.5)).toBe(1.5);
    });
  });
});

// =============================================================================
// calculateRemainingTime Tests
// =============================================================================

describe('calculateRemainingTime', () => {
  describe('valid data', () => {
    it('should calculate positive remaining time', () => {
      const now = 1000000;
      const endTimestamp = now + 60000; // 60 seconds from now
      expect(calculateRemainingTime(endTimestamp, now)).toBe(60);
    });

    it('should return 0 when timestamps are equal', () => {
      const now = 1000000;
      expect(calculateRemainingTime(now, now)).toBe(0);
    });

    it('should return negative when timer expired', () => {
      const now = 1000000;
      const endTimestamp = now - 30000; // 30 seconds ago
      expect(calculateRemainingTime(endTimestamp, now)).toBe(-30);
    });
  });

  describe('edge cases', () => {
    it('should round up fractional seconds', () => {
      const now = 1000000;
      const endTimestamp = now + 1500; // 1.5 seconds
      expect(calculateRemainingTime(endTimestamp, now)).toBe(2);
    });

    it('should handle very small differences', () => {
      const now = 1000000;
      const endTimestamp = now + 1; // 1ms
      expect(calculateRemainingTime(endTimestamp, now)).toBe(1);
    });
  });
});

// =============================================================================
// isValidRemainingTime Tests
// =============================================================================

describe('isValidRemainingTime', () => {
  describe('valid times', () => {
    it('should return true for 0', () => {
      expect(isValidRemainingTime(0)).toBe(true);
    });

    it('should return true for positive times within limit', () => {
      expect(isValidRemainingTime(60)).toBe(true);
      expect(isValidRemainingTime(600)).toBe(true); // 10 minutes, within 15 min max
      expect(isValidRemainingTime(MAX_REASONABLE_TIME_SECONDS)).toBe(true);
    });
  });

  describe('invalid times', () => {
    it('should return false for negative times', () => {
      expect(isValidRemainingTime(-1)).toBe(false);
      expect(isValidRemainingTime(-100)).toBe(false);
    });

    it('should return false for times exceeding max', () => {
      expect(isValidRemainingTime(MAX_REASONABLE_TIME_SECONDS + 1)).toBe(false);
      expect(isValidRemainingTime(MAX_REASONABLE_TIME_SECONDS * 2)).toBe(false);
    });
  });
});

// =============================================================================
// clampRemainingTime Tests
// =============================================================================

describe('clampRemainingTime', () => {
  describe('within bounds', () => {
    it('should return value unchanged if within bounds', () => {
      expect(clampRemainingTime(60, 180)).toBe(60);
      expect(clampRemainingTime(0, 180)).toBe(0);
      expect(clampRemainingTime(180, 180)).toBe(180);
    });
  });

  describe('out of bounds', () => {
    it('should clamp negative to 0', () => {
      expect(clampRemainingTime(-10, 180)).toBe(0);
      expect(clampRemainingTime(-1, 180)).toBe(0);
    });

    it('should clamp above max to max', () => {
      expect(clampRemainingTime(200, 180)).toBe(180);
      expect(clampRemainingTime(1000, 180)).toBe(180);
    });
  });
});

// =============================================================================
// calculateTimerProgress Tests
// =============================================================================

describe('calculateTimerProgress', () => {
  describe('valid calculations', () => {
    it('should calculate 100% at start', () => {
      expect(calculateTimerProgress(180, 180)).toBe(100);
    });

    it('should calculate 50% at midpoint', () => {
      expect(calculateTimerProgress(90, 180)).toBe(50);
    });

    it('should calculate 0% when done', () => {
      expect(calculateTimerProgress(0, 180)).toBe(0);
    });

    it('should handle fractional percentages', () => {
      expect(calculateTimerProgress(45, 180)).toBe(25);
    });
  });

  describe('edge cases', () => {
    it('should return 0 for negative remaining', () => {
      expect(calculateTimerProgress(-10, 180)).toBe(0);
    });

    it('should return 0 for zero total', () => {
      expect(calculateTimerProgress(60, 0)).toBe(0);
    });

    it('should cap at 100% if remaining > total', () => {
      expect(calculateTimerProgress(200, 180)).toBe(100);
    });
  });
});

// =============================================================================
// formatTime Tests
// =============================================================================

describe('formatTime', () => {
  describe('valid formatting', () => {
    it('should format seconds only', () => {
      expect(formatTime(30)).toBe('0:30');
      expect(formatTime(5)).toBe('0:05');
      expect(formatTime(0)).toBe('0:00');
    });

    it('should format minutes and seconds', () => {
      expect(formatTime(60)).toBe('1:00');
      expect(formatTime(90)).toBe('1:30');
      expect(formatTime(125)).toBe('2:05');
    });

    it('should format large times', () => {
      expect(formatTime(3600)).toBe('60:00');
      expect(formatTime(3661)).toBe('61:01');
    });
  });

  describe('edge cases', () => {
    it('should handle negative as 0', () => {
      expect(formatTime(-10)).toBe('0:00');
    });

    it('should floor fractional seconds', () => {
      expect(formatTime(30.9)).toBe('0:30');
      expect(formatTime(30.1)).toBe('0:30');
    });
  });
});

// =============================================================================
// shouldNotifyTimerComplete Tests
// =============================================================================

describe('shouldNotifyTimerComplete', () => {
  describe('should notify', () => {
    it('should return true if timer just completed', () => {
      const now = 1000000;
      const endTimestamp = now - 1000; // 1 second ago
      expect(shouldNotifyTimerComplete(endTimestamp, now)).toBe(true);
    });

    it('should return true if within threshold', () => {
      const now = 1000000;
      const endTimestamp = now - TIMER_NOTIFICATION_THRESHOLD_MS + 1000;
      expect(shouldNotifyTimerComplete(endTimestamp, now)).toBe(true);
    });
  });

  describe('should not notify', () => {
    it('should return false if timer completed long ago', () => {
      const now = 1000000;
      const endTimestamp = now - TIMER_NOTIFICATION_THRESHOLD_MS - 1000;
      expect(shouldNotifyTimerComplete(endTimestamp, now)).toBe(false);
    });

    it('should return false if timer completed exactly at threshold', () => {
      const now = 1000000;
      const endTimestamp = now - TIMER_NOTIFICATION_THRESHOLD_MS;
      expect(shouldNotifyTimerComplete(endTimestamp, now)).toBe(false);
    });
  });
});

// =============================================================================
// getTimerState Tests
// =============================================================================

describe('getTimerState', () => {
  describe('running timer', () => {
    it('should return running state for active timer', () => {
      const now = 1000000;
      const endTimestamp = now + 60000; // 60 seconds from now
      const state = getTimerState(endTimestamp, now);
      
      expect(state.remaining).toBe(60);
      expect(state.isRunning).toBe(true);
      expect(state.isCompleted).toBe(false);
      expect(state.isValid).toBe(true);
    });
  });

  describe('completed timer', () => {
    it('should return completed state for expired timer', () => {
      const now = 1000000;
      const endTimestamp = now - 10000; // 10 seconds ago
      const state = getTimerState(endTimestamp, now);
      
      expect(state.remaining).toBe(0);
      expect(state.isRunning).toBe(false);
      expect(state.isCompleted).toBe(true);
      expect(state.isValid).toBe(false); // negative remaining is invalid
    });
  });

  describe('invalid timer (clock manipulation)', () => {
    it('should return invalid state for unreasonably large time', () => {
      const now = 1000000;
      const endTimestamp = now + (MAX_REASONABLE_TIME_SECONDS + 100) * 1000;
      const state = getTimerState(endTimestamp, now);
      
      expect(state.isRunning).toBe(false);
      expect(state.isValid).toBe(false);
    });
  });

  describe('edge case: exactly at completion', () => {
    it('should return completed when remaining is exactly 0', () => {
      const now = 1000000;
      const state = getTimerState(now, now);
      
      expect(state.remaining).toBe(0);
      expect(state.isRunning).toBe(false);
      expect(state.isCompleted).toBe(true);
      expect(state.isValid).toBe(true);
    });
  });
});

// =============================================================================
// Constants Tests
// =============================================================================

describe('Constants', () => {
  it('should have reasonable default values', () => {
    expect(MIN_REST_TIME_SECONDS).toBe(1);
    expect(DEFAULT_REST_TIME_SECONDS).toBe(180);
    expect(MAX_REASONABLE_TIME_SECONDS).toBe(900); // 15 minutes
    expect(TIMER_NOTIFICATION_THRESHOLD_MS).toBe(60000); // 60 seconds
  });
});
