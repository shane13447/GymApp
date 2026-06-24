/**
 * Unit tests for the shared lib/coach-utils.ts parseVariantString helper.
 *
 * parseVariantString was previously duplicated verbatim in
 * services/coach/operation-applier.ts and services/coach/operation-safeguards.ts
 * (review-2 finding L4). These tests pin its behaviour after extraction.
 */

import { parseVariantString } from '@/lib/coach-utils';

describe('parseVariantString', () => {
  it('returns null for an empty string', () => {
    expect(parseVariantString('')).toBeNull();
  });

  it('returns null for whitespace-only input', () => {
    expect(parseVariantString('   ')).toBeNull();
  });

  it('returns null when there are no parseable segments', () => {
    expect(parseVariantString(' / , ')).toBeNull();
  });

  it("maps 'incline' to the angle field", () => {
    expect(parseVariantString('incline')).toEqual({ angle: 'incline' });
  });

  it('maps a grip token to the grip field', () => {
    expect(parseVariantString('wide grip')).toEqual({ grip: 'wide grip' });
  });

  it('maps a posture token to the posture field', () => {
    expect(parseVariantString('seated')).toEqual({ posture: 'seated' });
  });

  it("maps a laterality token ('one-arm') to the laterality field", () => {
    expect(parseVariantString('one-arm')).toEqual({ laterality: 'one-arm' });
  });

  it('maps an unrecognised token to extras', () => {
    expect(parseVariantString('paused')).toEqual({ extras: ['paused'] });
  });

  it("splits multi-segment input 'incline / wide grip' into angle + grip", () => {
    expect(parseVariantString('incline / wide grip')).toEqual({
      angle: 'incline',
      grip: 'wide grip',
    });
  });

  it('trims surrounding whitespace from each segment', () => {
    expect(parseVariantString('  incline  ,  wide grip  ')).toEqual({
      angle: 'incline',
      grip: 'wide grip',
    });
  });

  it('accumulates multiple unrecognised tokens into extras', () => {
    expect(parseVariantString('paused, tempo')).toEqual({
      extras: ['paused', 'tempo'],
    });
  });
});
