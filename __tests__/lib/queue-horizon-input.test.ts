import {
  DEFAULT_QUEUE_HORIZON,
  resolveQueueHorizonBlur,
  sanitizeQueueHorizonInput,
} from '@/lib/queue-horizon-input';

describe('queue horizon input', () => {
  describe('sanitizeQueueHorizonInput', () => {
    it('keeps the latest valid digit so new input overwrites the current value', () => {
      expect(sanitizeQueueHorizonInput('35')).toBe('5');
      expect(sanitizeQueueHorizonInput('921')).toBe('1');
    });

    it('allows the field to stay empty while the digit pad is open', () => {
      expect(sanitizeQueueHorizonInput('')).toBe('');
      expect(sanitizeQueueHorizonInput('0')).toBe('');
      expect(sanitizeQueueHorizonInput('abc')).toBe('');
    });
  });

  describe('resolveQueueHorizonBlur', () => {
    it('restores the last valid horizon when the field blurs empty', () => {
      expect(resolveQueueHorizonBlur('', 6)).toEqual({
        inputValue: '6',
        horizon: 6,
      });
    });

    it('falls back to the default horizon if the previous value is invalid', () => {
      expect(resolveQueueHorizonBlur('', 12)).toEqual({
        inputValue: String(DEFAULT_QUEUE_HORIZON),
        horizon: DEFAULT_QUEUE_HORIZON,
      });
    });
  });
});
